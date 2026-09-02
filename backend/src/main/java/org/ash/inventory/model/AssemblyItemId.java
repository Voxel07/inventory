package org.ash.inventory.model;

import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class AssemblyItemId implements Serializable {
    public UUID assemblyId;
    public UUID itemId;
    public AssemblyItemId() {}
    public AssemblyItemId(UUID assemblyId, UUID itemId) { this.assemblyId = assemblyId; this.itemId = itemId; }
    @Override public boolean equals(Object o) { return o instanceof AssemblyItemId other && Objects.equals(assemblyId, other.assemblyId) && Objects.equals(itemId, other.itemId); }
    @Override public int hashCode() { return Objects.hash(assemblyId, itemId); }
}
