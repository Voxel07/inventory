package org.ash.inventory.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "assemblies")
public class Assembly extends BaseEntity {
    @Column(nullable = false) public String name;
    public String description;
    public String hint;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "event_tags", columnDefinition = "jsonb", nullable = false)
    public List<String> eventTags = new ArrayList<>();
}
