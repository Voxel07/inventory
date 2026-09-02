package org.ash.inventory.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "app_users")
public class UserAccount extends BaseEntity {
    @Column(name = "external_subject", nullable = false, unique = true)
    public String externalSubject;
    @Column(nullable = false)
    public String name;
    public String email;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    public DomainEnums.UserRole role = DomainEnums.UserRole.faction_leader;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    public List<String> factions = new ArrayList<>();
}
