package org.ash.inventory.service;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.*;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.*;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.resource.ApiException;
import java.util.*;
/** Compensates the latest direct movement; document workflows retain their own reconciliation commands. */
@ApplicationScoped @Transactional
public class MovementReversalService {
    @Inject EntityManager em; @Inject ActorService actors; @Inject InventoryOperationsService inventory;
    @Inject PositionService positions; @Inject DomainEventService events;
    public record Input(@NotNull UUID commandId,@NotBlank @Size(max=255) String reason) {}
    public StockTransaction reverse(UUID id,Input input) {
        actors.requireAdmin(); var original=em.find(StockTransaction.class,id);
        if(original==null)throw ApiException.notFound("Movement not found");
        em.lock(original.item,LockModeType.PESSIMISTIC_WRITE);
        var prior=em.createQuery("from StockTransaction t where t.reverses.id=:id",StockTransaction.class).setParameter("id",id).getResultStream().findFirst().orElse(null);
        if(prior!=null) {
            if(!input.commandId().equals(prior.clientCommandId) || !input.reason().trim().equals(prior.reason))throw ApiException.conflict("Movement already reversed");
            return prior;
        }
        if(original.reverses!=null || original.order!=null || original.damageReport!=null || original.relatedEntityId!=null || original.custodyWriteOff
                || !Set.of(DomainEnums.TransactionType.added,DomainEnums.TransactionType.adjusted,DomainEnums.TransactionType.checkout,DomainEnums.TransactionType.checkin).contains(original.type))
            throw ApiException.conflict("Use the originating document's reconciliation workflow for this movement");
        var later=em.createQuery("from StockTransaction t where t.item=:item and t.id<>:id and (t.createdAt>:created or t.createdAt=:created and t.id>:id)",StockTransaction.class)
                .setParameter("item",original.item).setParameter("id",id).setParameter("created",original.createdAt).getResultList();
        // A consumable's direct checkout is consumed at once; that paired row is reversed with it.
        var consumed=later.stream().filter(t->isConsumedPair(original,t)).findFirst().orElse(null);
        if(later.size()>(consumed==null?0:1))
            throw ApiException.conflict("Reverse later movements first");
        if(em.createQuery("select count(r) from ReturnSubmission r where r.item=:item and r.status=:status",Long.class)
                .setParameter("item",original.item).setParameter("status",DomainEnums.ReturnSubmissionStatus.pending).getSingleResult()>0)
            throw ApiException.conflict("Resolve pending returns first");
        var value=new StockTransaction();value.item=original.item;value.user=original.user;value.type=original.type;value.quantity=-original.quantity;
        value.reverses=original;value.reversedBy=actors.current();value.reason=input.reason().trim();value.notes="Reversal of "+id;value.idempotencyKey=input.commandId();value.clientCommandId=input.commandId();
        value.eventOccurrence=original.eventOccurrence;value.eventType=original.eventType;value.faction=original.faction;
        value.sourceLocation=original.sourceLocation;value.destinationLocation=original.destinationLocation;value.lot=original.lot;
        value.availabilityBefore=inventory.stock(original.item).available();
        if(original.assetInstance==null && (original.type==DomainEnums.TransactionType.added || original.type==DomainEnums.TransactionType.adjusted)
                && original.quantity>inventory.physicalStock(original.item).available())
            throw ApiException.conflict("Release reservations or restore available stock before reversing this addition");
        for(var entry:original.positionQuantities.entrySet()) {
            var position=em.find(InventoryPosition.class,UUID.fromString(entry.getKey()),LockModeType.PESSIMISTIC_WRITE);
            int delta=-entry.getValue();
            if(delta<0 && position.availableQuantity()-positions.reservedAt(position)<-delta)throw ApiException.conflict("Stock is reserved, quarantined or unavailable");
            position.quantityOnHand+=delta;value.positionQuantities.put(entry.getKey(),delta);
        }
        if(original.assetInstance!=null) {
            var asset=em.find(AssetInstance.class,original.assetInstance.id,LockModeType.PESSIMISTIC_WRITE);
            if(original.assetBefore.containsKey("version") && asset.version!=Long.parseLong(original.assetBefore.get("version"))+1) throw ApiException.conflict("The asset changed after this movement");
            if(original.assetBefore.isEmpty())throw ApiException.conflict("Movement has no reversible asset evidence");
            if(asset.availabilityStatus==DomainEnums.AssetState.reserved || asset.availabilityStatus==DomainEnums.AssetState.staged)throw ApiException.conflict("Release the asset reservation first");
            asset.availabilityStatus=DomainEnums.AssetState.valueOf(original.assetBefore.get("state"));
            asset.currentLocation=reference(StorageLocation.class,original.assetBefore.get("location"));
            asset.currentCustodian=reference(UserAccount.class,original.assetBefore.get("custodian"));value.assetInstance=asset;
        }
        em.persist(value);
        if(consumed!=null) {
            var undo=new StockTransaction();undo.item=consumed.item;undo.user=consumed.user;undo.type=consumed.type;undo.quantity=-consumed.quantity;
            undo.reverses=consumed;undo.reversedBy=value.reversedBy;undo.reason=value.reason;undo.notes="Reversal of "+consumed.id;undo.clientCommandId=input.commandId();
            undo.eventOccurrence=consumed.eventOccurrence;undo.eventType=consumed.eventType;undo.faction=consumed.faction;undo.lot=consumed.lot;
            undo.availabilityBefore=value.availabilityBefore;
            em.persist(undo);
        }
        em.flush();value.availabilityAfter=inventory.stock(original.item).available();
        events.record("stock.reversed","item",original.item.id,actors.current().id,input.commandId(),Map.of("originalId",id,"reversalId",value.id,"reason",input.reason()));
        return value;
    }
    private static boolean isConsumedPair(StockTransaction checkout,StockTransaction candidate) {
        return checkout.type==DomainEnums.TransactionType.checkout && checkout.item.consumable() && checkout.assetInstance==null
                && candidate.type==DomainEnums.TransactionType.consumed && candidate.order==null && candidate.reverses==null
                && candidate.quantity==checkout.quantity && candidate.user.id.equals(checkout.user.id);
    }
    private <T> T reference(Class<T> type,String id) {return id==null?null:em.getReference(type,UUID.fromString(id));}
}
