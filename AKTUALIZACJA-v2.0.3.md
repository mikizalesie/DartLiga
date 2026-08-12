# DartLiga PWA 2.0.3

## Skład rozgrywek

- tabela ligi pokazuje wyłącznie zawodników zakwalifikowanych do terminarza,
- limit uczestników jest twardym limitem składu,
- opłacony zawodnik z listy rezerwowej zastępuje nieopłaconego zawodnika z listy podstawowej tylko wtedy, gdy istnieje wolne miejsce,
- zawodnicy pozostający poza składem nie pojawiają się w tabeli ani statystykach rozgrywki.

## Liga każdy z każdym

Dla parzystej liczby zawodników liczba kolejek wynosi `N - 1`. Dla 16 zawodników: 15 kolejek i 120 meczów. Dla nieparzystej liczby zawodników liczba kolejek wynosi `N`, ponieważ w każdej kolejce jeden zawodnik pauzuje.

## Automatyczna naprawa starego terminarza

Jeżeli terminarz został utworzony wcześniejszą wersją dla zbyt wielu zawodników, aplikacja automatycznie przebuduje go po uruchomieniu, ale tylko gdy żaden mecz nie jest jeszcze rozpoczęty ani zakończony. Po rozpoczęciu rozgrywek skład pozostaje zablokowany, aby nie usunąć historii meczów.

## Aktualizacja

Wgraj `app.js`, `styles.css`, `index.html` i `sw.js`, wykonaj Commit changes, poczekaj na publikację i uruchom PWA ponownie.
