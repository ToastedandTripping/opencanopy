# Carbon Calculation Methodology

OpenCanopy estimates carbon storage in BC forests using species-specific density values and a logistic growth model. These are approximate estimates for comparative purposes, not audited carbon accounting.

## Carbon Density Model

Carbon stock is modeled as total ecosystem carbon (above-ground biomass + root systems + soil organic carbon + deadwood) in tonnes C per hectare at maturity.

Growth follows a logistic curve:

```
C(age) = C_max * (1 - e^(-k * age))
```

Where:
- `C_max` is the maximum carbon density at maturity (tonnes C/ha)
- `k` is the species-specific growth rate constant
- `age` is the projected stand age from VRI data (PROJ_AGE_1)

## Species Carbon Density Table

| Species Code | Common Name | C_max (t C/ha) | k | Notes |
|-------------|-------------|-----------------|-------|-------|
| CW | Western Red Cedar | 350 | 0.008 | Long-lived, high biomass coastal species |
| HW | Western Hemlock | 400 | 0.008 | Dominant coastal species, high density |
| FD | Douglas-fir | 300 | 0.008 | Widespread, moderate-high density |
| SS | Sitka Spruce | 350 | 0.008 | Coastal, large maximum size |
| PL | Lodgepole Pine | 140 | 0.012 | Interior, faster growth, lower max |
| SX | Spruce hybrid | 200 | 0.010 | Interior, moderate density |
| BA | Amabilis Fir | 250 | 0.008 | Coastal mid-elevation |
| AT | Trembling Aspen | 115 | 0.012 | Deciduous, fast turnover |
| YC | Yellow Cedar | 300 | 0.006 | Slow-growing, very long-lived |
| DEFAULT | Unknown species | 250 | 0.008 | Fallback for unclassified stands |

### Sources

- Kurz, W.A. et al. (2013). CBM-CFS3: A model of carbon dynamics in forestry and land-use change implementing IPCC standards. *Ecological Modelling*, 220(4), 480-504.
- Smithwick, E.A.H. et al. (2002). Potential upper bounds of carbon stores in forests of the Pacific Northwest. *Ecological Applications*, 12(5), 1303-1317.
- BC Ministry of Forests. Provincial Carbon Stock Estimation Framework (VRI-based methods).

## CO2 Equivalence

Carbon weight is converted to CO2 equivalent using the molecular weight ratio:

```
CO2e = Carbon (tonnes) * 3.67
```

This is the standard IPCC conversion factor (44/12, the ratio of CO2 molecular weight to carbon atomic weight).

## Equivalence Conversions

| Equivalence | Value | Source |
|-------------|-------|--------|
| Cars per year | 4.61 tonnes CO2/car/year | EPA (2024), average passenger vehicle |
| Canadian homes per year | 7.5 tonnes CO2/home/year | NRCan residential energy use |
| YVR-YYZ round trip | 1.6 tonnes CO2/flight | ICAO Carbon Emissions Calculator |

## Age Classification

Forest stands are classified by projected age from VRI data:

| Class | Age Range | Description |
|-------|-----------|-------------|
| Old Growth | 250+ years | Ancient forest, maximum carbon storage |
| Mature | 80-250 years | Established forest, significant carbon |
| Young | <80 years | Regenerating or second-growth forest |
| Harvested | Any (has harvest date) | Recently logged, minimal standing carbon |

## Known Limitations

1. **Upper-range density values.** C_max values represent total ecosystem carbon including soil organic carbon and deadwood. Published ranges for above-ground biomass alone are typically 10-20% lower. This means estimates lean toward the high end.

2. **Tile clipping.** At lower zoom levels, forest polygons at tile boundaries are clipped by the rendering engine. The calculator only counts features visible on screen, so polygons split across tiles may be partially counted. This effect decreases at higher zoom levels.

3. **VRI age estimation.** The PROJ_AGE_1 field is a modeled projection, not a direct measurement. Accuracy varies by region and stand type. Some stands lack age data entirely and are classified as "unknown."

4. **Spatial resolution.** VRI polygons represent delineated forest stands, not individual trees. Carbon density is applied uniformly across each polygon.

5. **No disturbance modeling.** The model does not account for recent disturbances (fire, disease, windthrow) that may have reduced carbon stocks since the last VRI update.

6. **Single species assumption.** Each polygon is classified by its primary species code (SPECIES_CD_1). Mixed-species stands use only the dominant species density.

## Data Freshness

- **VRI data** is updated annually by the BC Ministry of Forests. The WFS endpoint serves the current published version.
- **Edge function cache** has a 7-day TTL. Data is refreshed weekly at minimum.
- **Browser cache** follows standard HTTP caching headers.
