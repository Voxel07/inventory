package org.ash.inventory.model;
import jakarta.persistence.*;
@Entity @Table(name = "source_revisions")
public class SourceRevision {
    @Id @Column(length = 100) public String name;
    @Column(nullable = false) public long revision;
    @Column(nullable = false) @org.hibernate.annotations.ColumnDefault("gen_random_uuid()") public java.util.UUID epoch;
}
