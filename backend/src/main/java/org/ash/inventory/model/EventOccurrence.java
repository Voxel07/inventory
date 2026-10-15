package org.ash.inventory.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

@Entity
@Table(name = "event_occurrences")
public class EventOccurrence extends BaseEntity {
    @Column(name = "event_type", nullable = false) public String eventType;
    @Column(nullable = false) public String name;
    @Column(name = "start_date", nullable = false) public LocalDate startDate;
    @Column(name = "end_date", nullable = false) public LocalDate endDate;
    @Column(nullable = false) public String status = "planned";
    @Column(name = "daily_main_meal_stamps", nullable = false) public int dailyMainMealStamps = 4;
    @Column(name = "daily_breakfast_stamps", nullable = false) public int dailyBreakfastStamps = 1;
    @Column(name = "first_day_main_meal_stamps", nullable = false) public int firstDayMainMealStamps = 2;
    public String notes;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "planned_quantities", columnDefinition = "jsonb")
    public Map<String, Integer> plannedQuantities = new LinkedHashMap<>();
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "used_quantities", columnDefinition = "jsonb")
    public Map<String, Integer> usedQuantities = new LinkedHashMap<>();
}
