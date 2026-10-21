package org.ash.inventory.operations.internal.application;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.notification.api.NotificationService;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.UserAccount;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.platform.api.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.*;
import java.util.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.zip.*;

/** Person-scoped relational export and deliberate pseudonymization; stock facts retain their actor UUIDs. */
@ApplicationScoped
public class PersonalDataService {
    @Inject NotificationService notifications;
    @Inject EntityManager em;
    @Inject ActorService actors;
    @Inject AccountLifecycleService lifecycle;
    @Inject DomainEventService events;
    public record EraseInput(@NotNull Long revision, @NotBlank @Size(max=1000) String reason) {}
    private static final class ExportBuffer extends ByteArrayOutputStream {
        private void reserve(int length) {
            if ((long)count+length>25*1024*1024) throw new ApiException(413,"Person export exceeds 25 MiB; use an operator-assisted export");
        }
        @Override public synchronized void write(int value) { reserve(1); super.write(value); }
        @Override public synchronized void write(byte[] value,int offset,int length) { reserve(length); super.write(value,offset,length); }
    }

    @Transactional
    public byte[] export(UUID id) {
        actors.requireAdmin(); if (em.find(UserAccount.class,id)==null) throw ApiException.notFound("User not found");
        try {
            var output=new ExportBuffer();
            try(var zip=new ZipOutputStream(output,StandardCharsets.UTF_8)) {
                write(zip,"README.txt","Person-scoped inventory export. Actor UUIDs link historical facts. Media rows are a manifest; authenticated media endpoints provide the attached files. Free text containing a person's name without a relational link requires a separate review.\n");
                var references=em.createNativeQuery("select distinct kcu.table_name, kcu.column_name from information_schema.table_constraints tc join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name and tc.constraint_schema=kcu.constraint_schema join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.constraint_schema where tc.constraint_type='FOREIGN KEY' and ccu.table_name='app_users' and tc.table_schema=current_schema() order by 1,2").getResultList();
                var stores=new LinkedHashMap<String,List<String>>(); stores.put("app_users",new ArrayList<>(List.of("id")));
                for(var reference:references) { var row=(Object[])reference; String table=row[0].toString(),column=row[1].toString();
                    if (!table.matches("[a-z_]+") || !column.matches("[a-z_]+")) throw new IllegalStateException("Invalid schema identifier");
                    if (!table.equals("revoked_sessions") && !table.equals("notifications")) stores.computeIfAbsent(table,key->new ArrayList<>()).add(column);
                }
                int total=0;
                for(var store:stores.entrySet()) {
                    String predicate=store.getValue().stream().map(c->"r."+c+"=:id").collect(java.util.stream.Collectors.joining(" or "));
                    total+=store(zip,store.getKey(),predicate,id,total);
                    if(output.size()>25*1024*1024) throw new ApiException(413,"Person export exceeds 25 MiB; use an operator-assisted export");
                }
                zip.putNextEntry(new ZipEntry("notifications.ndjson"));
                for(int offset=0;;offset+=100){
                    var notices=notifications.personalData(id,offset,100);
                    for(String notice:notices){if(total++>=25000)throw new ApiException(413,"Person export exceeds its row budget");zip.write(notice.getBytes(StandardCharsets.UTF_8));zip.write('\n');}
                    if(notices.size()<100)break;
                }
                zip.closeEntry();
                store(zip,"event_attendees","r.person_id in (select id from event_people where user_id=:id)",id,total);
            }
            if(output.size()>25*1024*1024) throw new ApiException(413,"Person export exceeds 25 MiB; use an operator-assisted export");
            return output.toByteArray();
        } catch(IOException exception) { throw new IllegalStateException("Cannot create person export",exception); }
    }
    private int store(ZipOutputStream zip,String table,String predicate,UUID id,int previous) throws IOException {
        zip.putNextEntry(new ZipEntry(table+".ndjson")); int offset=0;
        while(true) {
            var rows=em.createNativeQuery("select cast(row_to_json(r) as text) from "+table+" r where "+predicate+" order by cast(row_to_json(r) as text) offset :offset limit 100")
                    .setParameter("id",id).setParameter("offset",offset).getResultList();
            for(var row:rows) {
                byte[] data=row.toString().getBytes(StandardCharsets.UTF_8);
                if(data.length>2*1024*1024 || previous+offset++>=25000) throw new ApiException(413,"Person export exceeds its safe size; use an operator-assisted export");
                zip.write(data);zip.write('\n');
            }
            if(rows.size()<100)break;
        }
        zip.closeEntry();return offset;
    }
    private void write(ZipOutputStream zip,String name,String text) throws IOException {zip.putNextEntry(new ZipEntry(name));zip.write(text.getBytes(StandardCharsets.UTF_8));zip.closeEntry();}

    @Transactional
    public void erase(UUID id,EraseInput input) {
        actors.requireAdmin();
        var overview=lifecycle.overview(id);
        if (!overview.custody().isEmpty() || overview.keeperAssignments()>0 || !overview.resources().isEmpty())
            throw ApiException.conflict("Resolve custody, keeper assignments and private ownership before pseudonymization");
        lifecycle.status(id,new AccountLifecycleService.StatusInput(false,input.revision(),input.reason()));
        var user=em.find(UserAccount.class,id,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        String alias="Former member "+id.toString().substring(0,8);
        user.name=alias;user.email="";user.factions.clear();user.setRoles(List.of(DomainEnums.UserRole.tenant));
        em.createNativeQuery("update event_people set name=:alias, updated_at=now() where user_id=:id").setParameter("alias",alias).setParameter("id",id).executeUpdate();
        em.createNativeQuery("update event_attendees set notes=null where person_id in (select id from event_people where user_id=:id)").setParameter("id",id).executeUpdate();
        em.createNativeQuery("delete from inventory_access_grants where user_id=:id").setParameter("id",id).executeUpdate();
        em.createNativeQuery("delete from inventory_access_group_members where user_id=:id").setParameter("id",id).executeUpdate();
        notifications.erase(id);
        em.createNativeQuery("delete from action_reminders where user_id=:id").setParameter("id",id).executeUpdate();
        events.record("user.pseudonymized","user",id,actors.current().id,null,Map.of("reason",input.reason(),"retained","Historical actor UUIDs and external identity blocking key"));
    }
}
