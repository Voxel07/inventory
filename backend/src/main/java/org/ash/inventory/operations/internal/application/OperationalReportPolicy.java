package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.UserAccount;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.reporting.api.ReportPolicy;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
@ApplicationScoped @Transactional
public class OperationalReportPolicy implements ReportPolicy {
    @Inject EntityManager em;
    @Inject ObjectMapper json;
    public void requireRead(UUID actorId){user(actorId);}
    private UserAccount user(UUID id){var u=em.find(UserAccount.class,id);if(u==null || !u.active || !u.role.atLeast(DomainEnums.UserRole.warehouse_crew))throw ApiException.forbidden("Warehouse access required");return u;}
    public Set<Integer> allowed(UUID actorId,List<Map<String,Object>> candidates){
        var u=user(actorId);if(candidates.size()>200)throw new IllegalArgumentException("Report authorization batch too large");
        var where=new StringBuilder(" where true");
        for(var ref:Map.of("itemId","item","locationId","location","siteId","location","orderId","order","assemblyId","assembly").entrySet())
            where.append(" and inventory_resource_visible('").append(ref.getValue()).append("',cast(value->>'").append(ref.getKey()).append("' as uuid),:actor,:admin,true)");
        String encoded;try{encoded=json.writeValueAsString(candidates);}catch(com.fasterxml.jackson.core.JsonProcessingException ex){throw new IllegalArgumentException("Invalid report facts",ex);}
        var rows=em.createNativeQuery("select ordinal from jsonb_array_elements(cast(:rows as jsonb)) with ordinality snapshot(value,ordinal)"+where)
            .setParameter("rows",encoded).setParameter("actor",actorId).setParameter("admin",u.role==DomainEnums.UserRole.admin).getResultList();
        var result=new HashSet<Integer>();for(var row:rows)result.add(((Number)row).intValue()-1);return result;
    }
}
