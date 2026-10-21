package org.ash.inventory.operations.internal.application;

public record StockState(int onHand, int checkedOut, int inTransit, int damaged, int reserved, int available) {
        public int totalOwned() {
            return onHand + checkedOut + inTransit;
        }
    }
