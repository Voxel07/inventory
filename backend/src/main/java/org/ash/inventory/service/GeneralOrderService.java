package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.GeneralOrder;
import org.ash.inventory.orm.GeneralOrderOrm;
import org.ash.inventory.resource.ApiModels;

@ApplicationScoped
public class GeneralOrderService {
    private final ActorService actors;
    private final GeneralOrderOrm orm;

    public GeneralOrderService(ActorService actors, GeneralOrderOrm orm) {
        this.actors = actors;
        this.orm = orm;
    }

    @Transactional
    public GeneralOrder create(ApiModels.GeneralOrderInput input) {
        var order = new GeneralOrder();
        order.name = input.name().trim();
        order.purpose = input.purpose().trim();
        order.createdBy = actors.current();
        orm.persist(order);
        return order;
    }
}
