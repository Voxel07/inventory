package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.EquipmentCommitment;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.LoanArrangement;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.persistence.PlanningStockOrm;
import org.ash.inventory.platform.api.BusinessTime;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

/** Request-local stock snapshot. All access after load() is in memory. */
@ApplicationScoped
public class PlanningStockService {
    private final PlanningStockOrm orm;
    private final ObjectMapper json;
    private final StockReadService inventory;
    private final EquipmentPolicy equipment;

    public PlanningStockService(PlanningStockOrm orm, ObjectMapper json,
            StockReadService inventory, EquipmentPolicy equipment) {
        this.orm = orm; this.json = json; this.inventory = inventory; this.equipment = equipment;
    }

    public Map<UUID, ItemStock> load(List<Item> items) {
        var snapshots = new HashMap<UUID, ItemStock>();
        var now = Instant.now();
        items.forEach(item -> snapshots.put(item.id, new ItemStock(item, now)));
        for (var row : orm.snapshot(items.stream().map(item -> item.id).toList(), BusinessTime.today())) {
            try {
                snapshots.get(row.itemId()).read(row, json);
            } catch (JsonProcessingException ex) {
                throw new IllegalStateException("Could not read planning stock snapshot", ex);
            }
        }
        for (var snapshot : snapshots.values()) {
            snapshot.finish(inventory);
            var physical = snapshot.physical();
            snapshot.stock = new StockState(physical.onHand(), physical.checkedOut(), physical.inTransit(),
                    physical.damaged(), physical.reserved(), equipment.available(snapshot.item, null, physical, 0, snapshot));
        }
        return snapshots;
    }

    public int availableFor(ItemStock snapshot, EventOccurrence event, int ownReservation) {
        // Reservations are fixed for an item throughout one deficits calculation.
        return snapshot.eventAvailability.computeIfAbsent(new EventAvailabilityKey(event.id, ownReservation),
                ignored -> equipment.available(snapshot.item, event, snapshot.physical(), ownReservation, snapshot));
    }

    private record EventAvailabilityKey(UUID eventId, int ownReservation) {}
    private record Position(UUID locationId, int blocked, int available) {}

    public static final class ItemStock implements EquipmentPolicy.AvailabilityData {
        private final Item item;
        private final Instant now;
        private final Map<DomainEnums.TransactionType, Long> totals = new EnumMap<>(DomainEnums.TransactionType.class);
        private final List<AssetInstance> assets = new ArrayList<>();
        private final List<EquipmentCommitment> commitments = new ArrayList<>();
        private final Map<UUID, LoanArrangement> loans = new HashMap<>();
        private final List<Position> positions = new ArrayList<>();
        private final List<MaintenancePolicy.Facts> schedules = new ArrayList<>();
        private final Map<UUID, Long> checkoutCounts = new HashMap<>();
        private final NavigableMap<LocalDate, Integer> consumed = new TreeMap<>();
        private final Map<EventAvailabilityKey, Integer> eventAvailability = new HashMap<>();
        private StockState physical;
        private StockState stock;
        private long custodyWriteOff, damage, reservations;
        private long itemCheckoutCount;
        private int inTransit;
        private boolean memberDamage;
        private AvailabilityEligibility eligibility;

        private ItemStock(Item item, Instant now) { this.item = item; this.now = now; }
        public StockState physical() { return physical; }
        public StockState stock() { return stock; }

        /**
         * Reads one snapshot row. Assets, commitments and loans become detached, read-only value holders for the
         * shared availability rules; they are never attached to the persistence context.
         */
        private void read(PlanningStockOrm.SnapshotRow row, ObjectMapper json) throws JsonProcessingException {
            switch (row.kind()) {
                case "transaction" -> {
                    totals.put(DomainEnums.TransactionType.valueOf(row.text1()), row.quantity1());
                    custodyWriteOff += row.quantity2();
                }
                case "damage" -> damage += row.quantity1();
                case "reservation" -> reservations += row.quantity1();
                case "member_damage" -> memberDamage = true;
                case "position" -> {
                    // quantity1 on hand, quantity2 damaged, quantity4 quarantined, decimal in transit;
                    // flag1 has a lot, flag2 the lot is usable today.
                    inTransit += row.decimal().intValueExact();
                    boolean usable = row.flag2() && (item.trackingMode != DomainEnums.TrackingMode.lot_tracked || row.flag1());
                    int onHand = Math.toIntExact(row.quantity1()), damaged = Math.toIntExact(row.quantity2());
                    int quarantined = Math.toIntExact(row.quantity4());
                    positions.add(new Position(row.referenceId(),
                            usable ? quarantined : Math.max(0, onHand - damaged),
                            usable ? Math.max(0, onHand - damaged - quarantined) : 0));
                }
                case "asset" -> {
                    var asset = new AssetInstance(); asset.id = row.entityId(); asset.item = item;
                    asset.currentLocation = location(row.referenceId());
                    asset.availabilityStatus = DomainEnums.AssetState.valueOf(row.text1());
                    asset.conditionStatus = DomainEnums.ConditionStatus.valueOf(row.text2());
                    asset.outOfService = row.flag1();
                    asset.operatingHours = row.decimal(); assets.add(asset);
                }
                case "checkout_count" -> {
                    itemCheckoutCount += row.quantity1();
                    if (row.entityId() != null) checkoutCounts.put(row.entityId(), row.quantity1());
                }
                case "schedule" -> schedules.add(new MaintenancePolicy.Facts(row.entityId(),
                        DomainEnums.MaintenanceIntervalType.valueOf(row.text1()), row.timestamp(), row.decimal(),
                        row.text2() == null ? null : new BigDecimal(row.text2())));
                case "consumed" -> consumed.merge(BusinessTime.date(row.timestamp()), Math.toIntExact(row.quantity1()), Integer::sum);
                case "commitment" -> {
                    var commitment = new EquipmentCommitment(); commitment.id = row.entityId(); commitment.item = item;
                    if (row.referenceId() != null) { commitment.event = new EventOccurrence(); commitment.event.id = row.referenceId(); }
                    commitment.quantity = Math.toIntExact(row.quantity1()); commitment.assetIds = strings(row.json1(), json);
                    commitment.availableFrom = row.date1();
                    commitment.availableUntil = row.date2();
                    commitment.createdAt = row.timestamp(); commitments.add(commitment);
                    if (row.loanId() != null) {
                        var loan = new LoanArrangement(); loan.id = row.loanId(); loan.commitment = commitment;
                        loan.providerLocation = location(row.providerId());
                        loan.collected = Math.toIntExact(row.quantity2()); loan.returned = Math.toIntExact(row.quantity3());
                        loan.collectedAssets = strings(row.json2(), json); loan.returnedAssets = strings(row.json3(), json);
                        loans.put(commitment.id, loan);
                    }
                }
                default -> throw new IllegalStateException("Unknown planning stock row: " + row.kind());
            }
        }

        private void finish(StockReadService inventory) {
            if (custodyWriteOff != 0) {
                totals.merge(DomainEnums.TransactionType.written_off, -custodyWriteOff, Long::sum);
                totals.merge(DomainEnums.TransactionType.consumed, custodyWriteOff, Long::sum);
            }
            commitments.sort(Comparator.comparing((EquipmentCommitment c) -> c.availableFrom)
                    .thenComparing(c -> c.createdAt).reversed());
            int blocked = item.trackingMode == DomainEnums.TrackingMode.serialized ? 0 : positions.stream().mapToInt(Position::blocked).sum();
            physical = inventory.physicalStock(item, totals, Math.toIntExact(damage), Math.toIntExact(reservations), blocked, inTransit, assets);
        }

        public boolean hasMemberDamage() { return memberDamage; }
        public boolean itemUsable() { return eligibility().itemUsable(); }
        public List<EquipmentCommitment> commitments() { return commitments; }
        public LoanArrangement loan(EquipmentCommitment commitment) { return loans.get(commitment.id); }
        public List<AssetInstance> assets() { return assets; }
        public int consumedDuring(EquipmentCommitment commitment) {
            return consumed.tailMap(commitment.availableFrom, true).values().stream().mapToInt(Integer::intValue).sum();
        }
        public int internalQuantity(UUID providerId) {
            return positions.stream().filter(p -> !p.locationId().equals(providerId)).mapToInt(Position::available).sum();
        }
        public boolean usable(AssetInstance asset) { return eligibility().usable(asset); }

        /** Schedules here are already restricted to active, checkout-blocking ones by the snapshot query. */
        private AvailabilityEligibility eligibility() {
            if (eligibility == null) eligibility = new AvailabilityEligibility(item, now, schedules, itemCheckoutCount, checkoutCounts);
            return eligibility;
        }
        private static StorageLocation location(UUID id) {
            if (id == null) return null;
            var location = new StorageLocation(); location.id = id; return location;
        }
        private static List<String> strings(String text, ObjectMapper json) throws JsonProcessingException {
            JsonNode array = json.readTree(text);
            var values = new ArrayList<String>(); array.forEach(value -> values.add(value.asText())); return values;
        }
    }
}
