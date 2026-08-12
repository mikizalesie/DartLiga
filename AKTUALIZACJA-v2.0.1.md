# DartLiga PWA 2.0.1 — automatyczne płatności zawodników

## Najważniejsza zmiana

Lista zawodników z zakładki **Konfiguracja** jest teraz automatycznie synchronizowana z zakładką **Zapisy i płatności**. Nie trzeba ponownie wpisywać tych samych imion.

- istniejące zgłoszenia są dopasowywane do zawodników po identyfikatorze lub nazwie,
- brakujący zawodnicy otrzymują automatycznie rekord płatności z aktualną kwotą wpisowego,
- przy wpisowym większym od 0 zł mają początkowo status `Oczekuje na płatność`,
- organizator oznacza płatność prostym przełącznikiem **TAK / NIE**,
- zaznaczenie `TAK` aktualizuje status na `Opłacony` i zwiększa zebrane środki,
- odznaczenie przywraca status `Oczekuje na płatność`,
- nowe osoby dodane w konfiguracji od razu pojawiają się w płatnościach,
- zmiana nazwy zawodnika aktualizuje również jego rekord płatności,
- istniejące opłacone wpisy nie są dublowane — zostają powiązane z odpowiadającym zawodnikiem,
- dodatkowe osoby spoza listy można nadal dodać ręcznie.

## Aktualizacja GitHuba

Wgraj do głównego katalogu: `app.js`, `styles.css`, `index.html`, `sw.js`. Po publikacji zamknij PWA, uruchom ponownie i wykonaj `Ctrl + F5`. Numer wersji powinien wynosić **2.0.1**.
