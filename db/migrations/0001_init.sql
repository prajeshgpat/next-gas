-- NextGas initial schema: stations, brands, append-only price facts, corridor query.
create extension if not exists postgis;

create table brands (
  id                  bigint generated always as identity primary key,
  wikidata_id         text unique not null,
  name                text not null,
  is_toptier          boolean not null default false,
  toptier_verified_at date
);

create table stations (
  id          bigint generated always as identity primary key,
  osm_id      text unique not null,          -- e.g. 'node/123', 'way/456'
  name        text,
  brand_id    bigint references brands (id),
  geog        geography (point, 4326) not null,
  address     text,
  amenities   jsonb not null default '{}'::jsonb,
  source      text not null default 'osm',
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index stations_geog_gist on stations using gist (geog);
create index stations_brand_id on stations (brand_id);

create type price_source as enum ('gasbuddy', 'google', 'crowd', 'estimate');
create type fuel_grade as enum ('regular', 'midgrade', 'premium', 'diesel');

-- Append-only: never update, so history feeds the brand-offset model.
create table price_observations (
  id            bigint generated always as identity,
  station_id    bigint not null references stations (id),
  grade         fuel_grade not null,
  price_usd     numeric(5, 3) not null check (price_usd between 1.50 and 10.00),
  observed_at   timestamptz not null,
  source        price_source not null,
  reporter_hash text,
  ingested_at   timestamptz not null default now(),
  primary key (id, observed_at),
  unique (station_id, grade, observed_at, source)
) partition by range (observed_at);

-- Monthly partitions are created ahead of time by the pipeline; this catches anything else.
create table price_observations_default partition of price_observations default;

create index price_observations_station_grade on price_observations (station_id, grade, observed_at desc);

-- Newest observation per (station, grade). Confidence is computed from age in the app (core/price.ts).
create view station_price_latest as
select distinct on (station_id, grade)
  station_id, grade, price_usd, observed_at, source
from price_observations
order by station_id, grade, observed_at desc;

create table regional_prices (
  region     text not null,                  -- EIA duoarea, e.g. 'SCA', 'R1X'
  grade      fuel_grade not null,
  week       date not null,
  price_usd  numeric(5, 3) not null,
  source     text not null default 'eia',
  primary key (region, grade, week)
);

-- Stations within `buffer_m` of a route, projected onto it.
-- route_wkt: LINESTRING in lon/lat (EPSG:4326). Returns miles along the route and miles off it.
create function corridor_stations(route_wkt text, buffer_m double precision default 2414)
returns table (
  station_id   bigint,
  name         text,
  brand_name   text,
  is_toptier   boolean,
  lon          double precision,
  lat          double precision,
  along_mi     double precision,
  off_route_mi double precision
)
language sql stable parallel safe as $$
  with r as (
    select st_geomfromtext(route_wkt, 4326) as geom,
           st_length(st_geomfromtext(route_wkt, 4326)::geography) as length_m
  )
  select s.id,
         s.name,
         b.name,
         coalesce(b.is_toptier, false),
         st_x(s.geog::geometry),
         st_y(s.geog::geometry),
         st_linelocatepoint(r.geom, s.geog::geometry) * r.length_m / 1609.344,
         st_distance(s.geog, r.geom::geography) / 1609.344
  from r
  join stations s on st_dwithin(s.geog, r.geom::geography, buffer_m)
  left join brands b on b.id = s.brand_id
$$;
