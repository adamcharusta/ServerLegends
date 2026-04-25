# Server Legends

Discord bot do kolekcjonowania kart czlonkow serwera. Gracze otwieraja paczki, zdobywaja karty uzytkownikow, handluja nimi i sprzedaja je na gieldzie.

## Wymagania

- Node.js 20+
- PostgreSQL 16+ albo Docker z Docker Compose
- aplikacja Discord z poprawnie dodanym botem i komendami slash

## Konfiguracja

Utworz plik `.env` w katalogu projektu:

```env
DISCORD_TOKEN=twoj_token_bota
CLIENT_ID=id_aplikacji_discord
GUILD_ID=id_serwera_testowego
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/server_legends
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=server_legends
NODE_ENV=production
```

`GUILD_ID` jest uzywany przy rejestracji komend jako komendy serwerowe, wiec najlepiej wdrazac bota najpierw na konkretny serwer testowy.

### Produkcja / Kubernetes

Na produkcji `DATABASE_URL` nie powinno wskazywac na `localhost`, tylko na serwis Postgresa w klastrze, na przyklad:

```env
DATABASE_URL=postgresql://serverlegends:twoje_haslo@postgres.postgres.svc.cluster.local:5432/serverlegends
NODE_ENV=production
```

## Uruchomienie

### Opcja 1: lokalnie

1. Zainstaluj zaleznosci:

```bash
npm install
```

2. Uruchom Postgresa i zaladuj schemat z [src/db/schema.sql](/c:/Users/charu/Desktop/ServerLegends/src/db/schema.sql).

3. Zarejestruj komendy Discord:

```bash
npm run deploy
```

4. Uruchom bota:

```bash
npm start
```

### Opcja 2: Docker Compose dla bazy

Projekt zawiera gotowy `docker-compose.yml` dla Postgresa:

```bash
docker compose up -d postgres
```

Schemat zostanie zaladowany automatycznie z [src/db/schema.sql](/c:/Users/charu/Desktop/ServerLegends/src/db/schema.sql).

## Instrukcja obslugi

### Pierwsza konfiguracja na serwerze

1. Administrator wpisuje `/setup`.
2. Ustawia `channel`, `interval`, `packs` oraz opcjonalnie `excluded_role`.
3. Po zapisaniu konfiguracji gracze moga uzywac `/open`.

### Komendy gracza

- `/help` - pokazuje skrocona instrukcje bezposrednio w Discordzie
- `/open [pack] [amount]` - otwiera wybrana paczke; do 5 paczek daje slider, a dla 6-50 robi tryb zbiorczy
- `/odds [pack]` - pokazuje szanse na kazdy tier dla wybranego typu paczki
- `/shop view` - pokazuje wszystkie dostepne paczki i ich ceny
- `/shop buy pack:<typ> amount:<liczba>` - kupuje paczki za monety
- `/inventory [page]` - pokazuje twoje karty
- `/cards id:<id>` - generuje obraz wybranej karty z inventory
- `/balance` - pokazuje liczbe monet, paczek i czas do kolejnej paczki
- `/sell id:<id>` - sprzedaje karte za wartosc bazowa
- `/market view [page]` - przeglada oferty gieldy
- `/market list card_id:<id> price:<cena>` - wystawia karte na sprzedaz
- `/market buy listing_id:<id>` - kupuje karte z gieldy
- `/market cancel listing_id:<id>` - wycofuje wlasna oferte
- `/trade user:<gracz> your_card:<id> their_card:<id>` - proponuje wymiane kart
- `/top [by]` - pokazuje ranking wedlug `balance`, `cards` albo `rarity`

### Komendy administratora

- `/setup channel:<kanal> interval:<h> packs:<liczba> [excluded_role]` - zapisuje konfiguracje serwera

## Typy Paczek

- `Basic Pack` - najtansza paczka i darmowy drop z `/setup`, nastawiona glownie na `Common` i `Uncommon`
- `Adventurer Pack` - lepsza szansa na srednie tiery i rare
- `Royal Pack` - drozsza paczka z mocniej podbitym high-tier dropem
- `Celestial Pack` - najdrozsza paczka, najmocniej nastawiona na najwyzsze tiery

`Basic Pack` zostaje darmowa paczka cykliczna przyznawana przez `/setup`, wiec system hourly/free packs dalej dziala. Pozostale paczki kupuje sie za monety zdobyte ze sprzedazy kart i handlu.

## Typy Kart

Bot ma 25 poziomow kart:

1. `Common I`
2. `Common II`
3. `Uncommon I`
4. `Uncommon II`
5. `Rare I`
6. `Rare II`
7. `Epic I`
8. `Epic II`
9. `Legendary I`
10. `Legendary II`
11. `Mythic I`
12. `Mythic II`
13. `Exotic I`
14. `Exotic II`
15. `Ancient I`
16. `Ancient II`
17. `Divine I`
18. `Divine II`
19. `Transcendent`
20. `Valentine` - karta eventowa
21. `Easter` - karta eventowa
22. `Halloween` - karta eventowa
23. `Christmas` - karta eventowa
24. `Horse Day` - karta eventowa
25. `Celestial`

Eventowe karty sa stale dostepne w zwyklym losowaniu, ale maja ekstremalnie niski drop. W praktyce sa bardzo rzadkie, a `Celestial` pozostaje jeszcze rzadszy.

### Tryb developerski

Przy `NODE_ENV=development` dostepna jest dodatkowa komenda `/dev` z narzedziami testowymi, na przyklad dodawaniem paczek, monet i kart.

## Przydatne skrypty

```bash
npm run deploy
npm run deploy:prod
npm run lint
npm run lint:fix
npm run format
```

## Deploy Na Bosman

Repo zawiera prosty skrypt do kolejnych wdrozen na serwer `bosman`:

```bash
npm run deploy:prod
```

Skrypt:
- pakuje aktualne repo bez `.env`, `.git` i `node_modules`
- wysyla archiwum na `bosman`
- buduje obraz Dockera na serwerze
- importuje obraz do K3s
- aktualizuje deployment `serverlegends-bot`
- ponownie rejestruje komendy Discord

Przed uruchomieniem upewnij sie, ze:
- masz skonfigurowane polaczenie `ssh bosman`
- produkcyjny sekret w Kubernetes juz istnieje albo chcesz go aktualizowac recznie
- lokalny `.env` zawiera aktualne `DISCORD_TOKEN`, `CLIENT_ID` i `GUILD_ID`
