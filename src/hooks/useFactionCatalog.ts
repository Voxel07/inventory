import { useQuery } from '@tanstack/react-query';
import { getEventTypes, getFactions } from '../services/referenceDataService';
import type { EventType, Faction } from '../types';
import { useAuth } from './useAuth';
import { canViewOrganization } from '../utils/access';

interface FactionCatalog {
  eventTypes: EventType[];
  factions: Faction[];
  factionsFor: (eventType: EventType | undefined) => Faction[];
  factionNames: (eventType: EventType | undefined) => string[];
  isLoading: boolean;
}

/** Event types and active factions from the API (the database is the only source). */
export function useFactionCatalog(): FactionCatalog {
  const { user } = useAuth();
  // Factions are organization data; tenants only need the event types (item tags).
  const factionQuery = useQuery({ queryKey: ['factions'], queryFn: () => getFactions(), staleTime: 5 * 60_000, networkMode: 'offlineFirst', enabled: canViewOrganization(user) });
  const eventTypeQuery = useQuery({ queryKey: ['event-types'], queryFn: () => getEventTypes(), staleTime: 5 * 60_000, networkMode: 'offlineFirst' });
  const factions = (factionQuery.data ?? []).filter((faction) => faction.active !== false);
  const factionsFor = (eventType: EventType | undefined) => factions.filter((faction) => faction.eventType === eventType);
  return {
    eventTypes: eventTypeQuery.data ?? [],
    factions,
    factionsFor,
    factionNames: (eventType) => factionsFor(eventType).map((faction) => faction.name),
    isLoading: factionQuery.isLoading || eventTypeQuery.isLoading,
  };
}
