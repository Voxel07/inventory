package org.ash.inventory.helper;
import org.ash.inventory.resource.ApiException;
public record PageBounds(int offset, int limit) {
    public static PageBounds of(int page, int size) {
        if (page < 0 || size < 1 || size > 200) throw ApiException.badRequest("Invalid page bounds");
        try { return new PageBounds(Math.multiplyExact(page, size), size); }
        catch (ArithmeticException e) { throw ApiException.badRequest("Page offset is too large"); }
    }
}
