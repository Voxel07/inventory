package org.ash.inventory.platform.api;

public record PageBounds(int offset, int limit) {
    /** REST list pages hold at most this many rows. */
    public static final int MAX_SIZE = 200;

    public static PageBounds of(int page, int size) {
        return of(page, size, MAX_SIZE);
    }

    public static PageBounds of(int page, int size, int maxSize) {
        if (page < 0) throw ApiException.badRequest("page must be zero or greater");
        if (size < 1 || size > maxSize) throw ApiException.badRequest("size must be between 1 and " + maxSize);
        try { return new PageBounds(Math.multiplyExact(page, size), size); }
        catch (ArithmeticException e) { throw ApiException.badRequest("page is too large"); }
    }
}
