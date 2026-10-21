package org.ash.inventory.integration.api;

public enum OutboxStatus { pending, processing, published, failed, dead_letter }
