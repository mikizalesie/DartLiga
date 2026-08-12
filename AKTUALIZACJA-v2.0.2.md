# DartLiga PWA 2.0.2

## Najważniejsze zmiany

### Lista podstawowa i lista rezerwowa
Ustawiony `Limit uczestników` jest teraz twardą granicą listy podstawowej. Przy limicie 16 po pozycji 16 pojawia się separator **LISTA REZERWOWA**, a kolejne osoby otrzymują pozycje R1, R2 itd.

### Dobór do terminarza
Do terminarza trafia maksymalnie liczba osób określona limitem. Aplikacja wybiera kolejno:
1. opłaconych lub potwierdzonych z listy podstawowej,
2. jeśli na liście podstawowej są nieopłacone miejsca — opłaconych/potwierdzonych z listy rezerwowej według kolejności R1, R2 itd.

Przykład: limit 16, na liście podstawowej opłaciło 15 osób, a R1 ma opłacone wpisowe — terminarz otrzyma 16 osób: 15 z podstawowej + R1. Jeśli wszystkich 16 z podstawowej jest opłaconych, nawet opłacony R1 pozostaje rezerwowym i nie trafia do terminarza.

### Rejestrowanie daty płatności
Po przełączeniu `Zapłacone` na **TAK** aplikacja zapisuje dokładną datę i godzinę wpłaty. Data jest widoczna w nowej kolumnie **Data opłacenia** i organizator może ją ręcznie skorygować, np. gdy wpłata faktycznie nastąpiła wcześniej. Każde oznaczenie wpłaty, cofnięcie, korekta daty, potwierdzenie i zwrot trafia do historii `paymentHistory`.

### Eksport CSV
Eksport zawiera teraz informację, czy zawodnik jest na liście podstawowej/rezerwowej, jego pozycję, czy jest aktualnie zakwalifikowany do terminarza, datę wpłaty oraz historię płatności.

## Aktualizacja GitHub Pages
Wgraj do głównego katalogu repozytorium:
- `app.js`,
- `styles.css`,
- `index.html`,
- `sw.js`.

Następnie wykonaj `Commit changes`, poczekaj na zakończenie publikacji, zamknij PWA i uruchom ponownie. W razie potrzeby wykonaj `Ctrl + F5`. W aplikacji powinna być widoczna wersja **2.0.2**.
