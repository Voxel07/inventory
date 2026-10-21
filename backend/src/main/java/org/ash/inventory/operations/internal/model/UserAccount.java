package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.persistence.BaseEntity;

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
    @Column(nullable = false) public boolean active = true;
    @Column(name = "deactivated_at") public java.time.Instant deactivatedAt;
    @Column(name = "offboarding_reason", length = 1000) public String offboardingReason;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    /** Effective (highest assigned) role, used by database visibility queries. */
    public DomainEnums.UserRole role = DomainEnums.UserRole.read_only;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    public List<DomainEnums.UserRole> roles = new ArrayList<>(List.of(DomainEnums.UserRole.read_only));

    public void setRoles(java.util.Collection<DomainEnums.UserRole> assigned) {
        if (assigned.isEmpty()) throw new IllegalArgumentException("Assign at least one role");
        roles = new ArrayList<>(new java.util.TreeSet<>(assigned));
        role = roles.getLast();
    }
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    /** {@code EVENT:slug} faction memberships, managed in the app by the inventory admin. */
    public List<String> factions = new ArrayList<>();
    /** Incremented on every role/faction change; guards concurrent edits. */
    @Column(name = "access_revision", nullable = false)
    public long accessRevision;
}
