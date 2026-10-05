package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "app_users", uniqueConstraints = @UniqueConstraint(name = "uq_app_users_identity", columnNames = {"issuer", "external_subject"}))
public class UserAccount extends BaseEntity {
    /** Token issuer; together with {@link #externalSubject} (the immutable {@code sub}) the account key. */
    @Column(nullable = false)
    public String issuer;
    @Column(name = "external_subject", nullable = false)
    public String externalSubject;
    /** Display data only. */
    @Column(nullable = false)
    public String name;
    public String email;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    public DomainEnums.UserRole role = DomainEnums.UserRole.faction_leader;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    /** Mirrored {@code EVENT:slug} faction memberships from the identity provider's groups. */
    public List<String> factions = new ArrayList<>();
}
