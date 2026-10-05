package org.ash.inventory.service;

import org.ash.inventory.helper.BusinessTime;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.PlanningStockOrm;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.*;

/** Request-local stock snapshot. All access after load() is in memory. */
@ApplicationScoped
public class PlanningStockService {
    private final PlanningStockOrm orm;
    private final ObjectMapper json;
    private final InventoryOperationsService inventory;
    private final EquipmentService equipment;

    public PlanningStockService(PlanningStockOrm orm, ObjectMapper json,
            InventoryOperationsService inventory, EquipmentService equipment) {
        this.orm = orm; this.json = json; this.inventory = inventory; this.equipment = equipment;
    }

    public Map<UUID, ItemStock> load(List<Item> items) {
        var snapshots = new HashMap<UUID, ItemStock>();
        var now = Instant.now();
        items.forEach(item -> snapshots.put(item.id, new ItemStock(item, now)));
        for (var row : orm.snapshot(items.stream().map(item -> item.id).toList(), BusinessTime.today())) {
            try {
                snapshots.get((UUID) row[1]).read((String) row[0], row, json);
            } catch (JsonProcessingException ex) {
                throw new IllegalStateException("Could not read planning stock snapshot", ex);
            }
        }
        for (var snapshot : snapshots.values()) {
            snapshot.finish(inventory);
            var physical = snapshot.physical();
            snapshot.stock = new InventoryOperationsService.StockState(physical.onHand(), physical.checkedOut(), physical.inTransit(),
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

    public static final class ItemStock implements EquipmentService.AvailabilityData {
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
        private InventoryOperationsService.StockState physical;
        private InventoryOperationsService.StockState stock;
        private long custodyWriteOff, damage, reservations;
        private long itemCheckoutCount;
        private int inTransit;
        private boolean memberDamage;

        private ItemStock(Item item, Instant now) { this.item = item; this.now = now; }
        public InventoryOperationsService.StockState physical() { return physical; }
        public InventoryOperationsService.StockState stock() { return stock; }

        private void read(String kind, Object[] row, ObjectMapper json) throws JsonProcessingException {
            switch (kind) {
                case "transaction" -> {
                    totals.put(DomainEnums.TransactionType.valueOf((String) row[4]), number(row[7]));
                    custodyWriteOff += number(row[8]);
                }
                case "damage" -> damage += number(row[7]);
                case "reservation" -> reservations += number(row[7]);
                case "member_damage" -> memberDamage = true;
                case "position" -> {
                    inTransit += Math.toIntExact(number(row[11]));
                    boolean usable = (boolean) row[19]
                            && (item.trackingMode != DomainEnums.TrackingMode.lot_tracked || (boolean) row[18]);
                    int onHand = Math.toIntExact(number(row[7])), damaged = Math.toIntExact(number(row[8]));
                    int quarantined = Math.toIntExact(number(row[10]));
                    positions.add(new Position((UUID) row[3],
                            usable ? quarantined : Math.max(0, onHand - damaged),
                            usable ? Math.max(0, onHand - damaged - quarantined - Math.toIntExact(number(row[9]))) : 0));
                }
                case "asset" -> {
                    var asset = new AssetInstance(); asset.id = (UUID) row[2]; asset.item = item;
                    asset.currentLocation = location((UUID) row[3]);
                    asset.availabilityStatus = DomainEnums.AssetState.valueOf((String) row[4]);
                    asset.conditionStatus = DomainEnums.ConditionStatus.valueOf((String) row[5]);
                    asset.serviceStatus = DomainEnums.MaintenanceStatus.valueOf((String) row[6]);
                    asset.operatingHours = (BigDecimal) row[11]; assets.add(asset);
                }
                case "checkout_count" -> {
                    itemCheckoutCount += number(row[7]);
                    if (row[2] != null) checkoutCounts.put((UUID) row[2], number(row[7]));
                }
                case "schedule" -> schedules.add(new MaintenancePolicy.Facts((UUID) row[2],
                        DomainEnums.MaintenanceIntervalType.valueOf((String) row[4]), instant(row[14]), (BigDecimal) row[11],
                        row[5] == null ? null : new BigDecimal((String) row[5])));
                case "consumed" -> consumed.merge(BusinessTime.date(instant(row[14])),
                        Math.toIntExact(number(row[7])), Integer::sum);
                case "commitment" -> {
                    var commitment = new EquipmentCommitment(); commitment.id = (UUID) row[2]; commitment.item = item;
                    UUID eventId = (UUID) row[3];
                    if (eventId != null) { commitment.event = new EventOccurrence(); commitment.event.id = eventId; }
                    commitment.quantity = Math.toIntExact(number(row[7])); commitment.assetIds = strings((String) row[15], json);
                    commitment.availableFrom = LocalDate.parse(row[12].toString());
                    commitment.availableUntil = LocalDate.parse(row[13].toString());
                    commitment.createdAt = instant(row[14]); commitments.add(commitment);
                    UUID loanId = (UUID) row[21];
                    if (loanId != null) {
                        var loan = new LoanArrangement(); loan.id = loanId; loan.commitment = commitment;
                        loan.providerLocation = location((UUID) row[20]);
                        loan.collected = Math.toIntExact(number(row[8])); loan.returned = Math.toIntExact(number(row[9]));
                        loan.collectedAssets = strings((String) row[16], json); loan.returnedAssets = strings((String) row[17], json);
                        loans.put(commitment.id, loan);
                    }
                }
                default -> throw new IllegalStateException("Unknown planning stock row: " + kind);
            }
        }

        private void finish(InventoryOperationsService inventory) {
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
        public boolean itemUsable() {
            return !MaintenancePolicy.blocksItem(item.active, item.maintenanceStatus, item.nextMaintenanceDue, BusinessTime.date(now))
                    && schedules.stream().filter(s -> s.assetId() == null).noneMatch(s -> blocking(s, null));
        }
        public List<EquipmentCommitment> commitments() { return commitments; }
        public LoanArrangement loan(EquipmentCommitment commitment) { return loans.get(commitment.id); }
        public List<AssetInstance> assets() { return assets; }
        public int consumedDuring(EquipmentCommitment commitment) {
            return consumed.tailMap(commitment.availableFrom, true).values().stream().mapToInt(Integer::intValue).sum();
        }
        public int internalQuantity(UUID providerId) {
            return positions.stream().filter(p -> !p.locationId().equals(providerId)).mapToInt(Position::available).sum();
        }
        public boolean usable(AssetInstance asset) {
            if (!asset.active || Set.of(DomainEnums.ConditionStatus.damaged, DomainEnums.ConditionStatus.unsafe,
                    DomainEnums.ConditionStatus.lost).contains(asset.conditionStatus)
                    || Set.of(DomainEnums.MaintenanceStatus.overdue, DomainEnums.MaintenanceStatus.in_service).contains(asset.serviceStatus)) return false;
            for (var schedule : schedules) {
                if (schedule.assetId() != null && !schedule.assetId().equals(asset.id)) continue;
                if (blocking(schedule, asset)) return false;
            }
            return true;
        }

        private boolean blocking(MaintenancePolicy.Facts schedule, AssetInstance asset) {
            return MaintenancePolicy.blocksCheckout(MaintenancePolicy.status(schedule, now,
                    new MaintenancePolicy.Counters(item.currentOperatingHours, itemCheckoutCount,
                            asset == null ? null : asset.operatingHours, asset == null ? 0 : checkoutCounts.getOrDefault(asset.id, 0L))));
        }

        private static long number(Object value) { return ((Number) value).longValue(); }
        private static Instant instant(Object value) {
            if (value == null) return null;
            if (value instanceof Instant instant) return instant;
            if (value instanceof OffsetDateTime dateTime) return dateTime.toInstant();
            return ((java.sql.Timestamp) value).toInstant();
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
