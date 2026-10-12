# Pokédex & kaarten

Een statische webapp om alle Pokémon te bekijken, inclusief hun Pokémon-kaarten (TCG). Wordt gehost via GitHub Pages.

**Live:** https://niels9001.github.io/pokedex/

## Functies

- Alle 1025 Pokémon met artwork, nummer en types
- Zoeken op naam of nummer, filteren op generatie en type
- Detailweergave met beschrijving, lengte, gewicht, vaardigheden en basisstatistieken
- Alle bijbehorende Pokémon-kaarten, klik voor een grote weergave
- Prijs per kaart (Cardmarket-trendprijs in €, anders TCGplayer in $), sorteren op prijs
- Kaarten afvinken die je hebt, met een **Mijn collectie**-overzicht en de geschatte totale waarde
- Collectie exporteren/importeren als JSON (de collectie wordt lokaal in je browser bewaard)
- Deelbare links, bijvoorbeeld `#/pokemon/25`
- Licht en donker thema

## Lokaal draaien

Er is geen build-stap nodig. Start een statische server in deze map:

```sh
npx serve .
# of
python -m http.server
```

## Databronnen

- [PokéAPI](https://pokeapi.co) – Pokémon-gegevens en artwork
- [TCGdex](https://tcgdex.dev) – Pokémon-kaarten en prijzen (Cardmarket / TCGplayer)

Pokémon en alle bijbehorende namen zijn handelsmerken van Nintendo, Game Freak en The Pokémon Company. Dit is een onofficieel fanproject.
