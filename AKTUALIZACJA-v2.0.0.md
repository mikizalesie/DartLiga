# DartLiga PWA 2.0.0 — Zapisy i płatności

## Najważniejsza zmiana

Wersja 2.0.0 dodaje pełny moduł zapisów na rozgrywkę i ręcznej obsługi wpisowego. Podczas tworzenia nowej rozgrywki organizator ustawia od razu wartość wpisowego w PLN.

## Tworzenie rozgrywki

Nowe pola:

- wpisowe w PLN (`0 zł` = udział bezpłatny),
- limit uczestników,
- termin końca zapisów,
- liczba godzin na opłacenie miejsca,
- lista rezerwowa,
- automatyczne zwalnianie nieopłaconych miejsc.

W konfiguracji aktywnej rozgrywki można dodatkowo wpisać instrukcję płatności i zasady zwrotu wpisowego.

## Zapisy zawodnika

Tryb Użytkownik otrzymuje zakładkę **Zapisy**. Zawodnik może:

- zobaczyć wpisowe, liczbę wolnych miejsc i termin zapisów,
- podać imię/nazwisko lub pseudonim,
- zadeklarować przelew albo płatność gotówką,
- zapisać się na listę rezerwową po wyczerpaniu miejsc,
- sprawdzić własny status i termin płatności,
- anulować nieopłacone zgłoszenie.

Przy wpisowym `0 zł` miejsce jest potwierdzane od razu. Przy wpisowym większym od zera zgłoszenie otrzymuje status **Oczekuje na płatność**.

## Panel organizatora

Zakładka **Zapisy i płatności** pokazuje:

- zajęte i wolne miejsca,
- liczbę opłaconych/potwierdzonych uczestników,
- oczekujących na płatność,
- listę rezerwową,
- sumę wpisowego oznaczonego jako opłacone.

Organizator może:

- dodać zgłoszenie ręcznie,
- oznaczyć płatność jako opłaconą,
- potwierdzić udział bez płatności,
- anulować zgłoszenie,
- oznaczyć zwrot,
- przenieść osobę z listy rezerwowej na wolne miejsce,
- eksportować zgłoszenia do CSV,
- dodać opłaconych/potwierdzonych uczestników do listy zawodników.

## Kwota historyczna

Każde zgłoszenie zapisuje własną `feeSnapshot`. Jeżeli organizator później zmieni wpisowe z 50 zł na 60 zł, wcześniejsze zgłoszenie nadal zachowuje 50 zł.

## Terminarz

Przy generowaniu terminarza aplikacja automatycznie dodaje do listy zawodników osoby ze statusem **Opłacony** lub **Potwierdzony**. Zgłoszenia oczekujące, wygasłe, anulowane i znajdujące się na liście rezerwowej nie trafiają do terminarza.

## Firebase

Zgłoszenia są synchronizowane jako osobne dokumenty:

```text
competitions/{competitionId}/registrations/{registrationId}
```

Dzięki temu wynik meczu i pojedyncze zgłoszenie są synchronizowane niezależnie. Dotychczasowa podkolekcja `matches` pozostaje bez zmian.

## Ważne ograniczenie 2.0.0

Ta wersja nie pobiera jeszcze prawdziwych pieniędzy. Płatność jest wykonywana poza aplikacją (np. przelew/gotówka), a organizator ręcznie zmienia jej status. Integrację z operatorem płatności można dodać w kolejnym etapie.

Tryb Użytkownik nadal korzysta z testowej anonimowej identyfikacji urządzenia. Pełne konta zawodników i zabezpieczenie ról wymagają późniejszego wdrożenia właściwego logowania.

Automatyczne wygaszanie nieopłaconych miejsc jest sprawdzane podczas działania aplikacji co około minutę oraz przy otwarciu modułu zapisów. Pełna obsługa terminów działająca także wtedy, gdy nikt nie ma otwartej aplikacji, wymaga funkcji backendowej.

## Aktualizacja GitHuba

Wgraj do głównego katalogu repozytorium:

- `app.js`,
- `styles.css`,
- `index.html`,
- `sw.js`,
- `manifest.webmanifest`.

Po publikacji zamknij wszystkie okna PWA, uruchom aplikację ponownie i wykonaj `Ctrl + F5`. Wersja aplikacji powinna wynosić `2.0.0`.
