import type en from './en';

/** German must provide exactly the same catalog structure as English. */
export type TranslationCatalog = CatalogShape<typeof en>;

type CatalogShape<T> = {
  [K in keyof T]: T[K] extends string ? string : CatalogShape<T[K]>;
};

type LeafKeys<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafKeys<T[K]>}`;
}[keyof T & string];

type PluralBase<K> = K extends `${infer Base}_one` | `${infer Base}_other` ? Base : never;

export type TranslationKey = LeafKeys<typeof en> | PluralBase<LeafKeys<typeof en>>;
export type TranslationOptions = Record<string, unknown> & { count?: number };
export type Translator = (key: TranslationKey, options?: TranslationOptions) => string;
