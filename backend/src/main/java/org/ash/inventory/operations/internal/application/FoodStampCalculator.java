package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.EventAttendee;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.operations.internal.model.EventTimelineEntry;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Catering uses calendar days at the event; travel times never round to 24-hour periods. */
public final class FoodStampCalculator {
    private FoodStampCalculator() {}

    public record Stamps(int mainMeals, int breakfasts) {}
    private record Period(LocalDate start, LocalDate end) {}

    public static Stamps calculate(EventAttendee attendee, List<EventTimelineEntry> timeline) {
        if (attendee.arrivesAt == null || attendee.leavesAt == null) return new Stamps(0, 0);
        EventOccurrence event = attendee.event;
        var periods = new ArrayList<Period>();
        periods.add(new Period(event.startDate, event.endDate));
        if (attendee.roles.stream().anyMatch(role -> "event_crew".equals(role.role))) {
            timeline.stream().filter(entry -> "catering".equals(entry.category)).forEach(entry -> periods.add(
                    new Period(entry.startsAt.toLocalDate(), (entry.endsAt == null ? entry.startsAt : entry.endsAt).toLocalDate())));
        }
        periods.sort(Comparator.comparing(Period::start));
        var merged = new ArrayList<Period>();
        for (var period : periods) {
            if (!merged.isEmpty() && ChronoUnit.DAYS.between(merged.getLast().end(), period.start()) <= 1) {
                var previous = merged.removeLast();
                merged.add(new Period(previous.start(), previous.end().isAfter(period.end()) ? previous.end() : period.end()));
            } else merged.add(period);
        }
        LocalDate arrival = attendee.arrivesAt.toLocalDate(), departure = attendee.leavesAt.toLocalDate();
        long mainMeals = 0, breakfasts = 0;
        for (var period : merged) {
            LocalDate start = arrival.isAfter(period.start()) ? arrival : period.start();
            LocalDate end = departure.isBefore(period.end()) ? departure : period.end();
            if (end.isBefore(start)) continue;
            long days = ChronoUnit.DAYS.between(start, end) + 1;
            boolean first = start.equals(period.start());
            // A one-day catering period serves the opening meal only.
            boolean last = end.equals(period.end()) && !period.start().equals(period.end());
            mainMeals += (days - (first ? 1 : 0) - (last ? 1 : 0)) * event.dailyMainMealStamps
                    + (first ? event.firstDayMainMealStamps : 0);
            breakfasts += (days - (first ? 1 : 0)) * event.dailyBreakfastStamps;
        }
        return new Stamps(Math.toIntExact(mainMeals), Math.toIntExact(breakfasts));
    }
}
