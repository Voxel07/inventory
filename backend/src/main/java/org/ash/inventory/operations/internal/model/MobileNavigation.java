package org.ash.inventory.operations.internal.model;

import java.util.List;

/**
 * Phone navigation chosen by a user. Keys are {@code tasks}, {@code scanner} or a route: the bottom- and top-bar destinations in
 * display order, destinations left out on phones, and whether the profile button also opens the inbox.
 */
public record MobileNavigation(List<String> bottom, List<String> top, List<String> hidden, boolean inboxInProfile) {}
