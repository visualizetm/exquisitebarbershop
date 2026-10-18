# Owner guide

For Dontrise. This is how to run the shop's website and bookings. Everything
happens at **yoursite/admin** (the address Visualize gave you). It works on a
phone and on a laptop; the pictures below are the laptop view unless they say
phone. If something looks wrong, the last section says who to call.

The screens in this guide were taken from the demo with sample names. Your own
clients will show in their place.

## 1. Sign in

1. Open **yoursite/admin**.
2. Type your email and password and tap **Sign in**.
3. The first time, the site asks you to choose a new password: 12 characters or
   more, not a word people could guess.

Barbers do not sign in here. They use their own page, **yoursite/team**
(see section 13).

![The sign in screen](screens/p11/guide/o01-sign-in.png)

## 2. Read the Overview

The Overview is the first screen. Left: the menu (Overview, Bookings, Schedule,
Customers, Team, Website, Settings). Top: search, today's date and **New
booking**. Then the quick actions, four tiles with real numbers for today, **Now
and next** for every chair, and a chart of bookings this week. On a phone the
menu becomes three tabs and **More** at the bottom.

A tile only shows a comparison with last week when there was a last week to
compare with. A red strip across the top means something needs your decision
(section 9).

![The Overview](screens/p11/guide/o02-overview.png)

On a phone:

![The Overview on a phone](screens/p11/guide/o02-overview-390.png)

## 3. Find a client or a booking

1. Tap the search box at the top, or press **/** on a laptop.
2. Type a name, a phone number or a booking code. Accents and capitals do not
   matter.
3. Pick a line from the list. A booking opens its panel; a client opens their
   history.

![Search results](screens/p11/guide/o03-search.png)

## 4. Add a booking for someone who called

1. Tap **New booking** (top right, or in the quick actions).
2. Tick the services, pick the barber, the day and the time.
3. Type the name and phone. Add an email only if they want a confirmation.
4. Tap the button at the bottom.

A phone booking follows the same rules as the website. If the time is too soon
or outside hours, tick **Allow inside the lead time or past the booking window** to take it anyway.

![The New booking panel](screens/p11/guide/o04-new-booking.png)

## 5. Add a walk-in

1. Tap **Walk-in** in the quick actions.
2. Tick the services, pick the chair, type the name and phone.
3. Tap **Add walk-in**. It starts now and the chair shows as busy.

![The walk-in panel](screens/p11/guide/o05-walk-in.png)

## 6. Work the Bookings table

1. Tap **Bookings** in the menu.
2. Use the quick filters (Today, Tomorrow, This week, Upcoming, Past, each with a count),
   or pick a barber or a status.
3. Tap a column heading to sort. Tap a row to open the booking.

The filters stay in the address, so you can bookmark a view.

![The bookings table](screens/p11/guide/o06-bookings-table.png)

On a phone:

![Bookings on a phone](screens/p11/guide/o06-bookings-390.png)

## 7. Change one booking

Open a booking from the table, the search or the Overview.

1. **Mark done** or **No show** when the visit is over. A small message offers
   **Undo** for a few seconds.
2. **Reschedule** moves it to another time. The customer gets a new link.
3. **Cancel** cancels it. **Cancel and notify** also emails the customer; it is
   greyed out when there is no email on file.
4. **Resend confirmation** and **Copy manage link** help a customer who lost
   theirs. Resend is greyed out while email is off, and the panel says why.
5. Type a private note and tap **Save notes**. Clients never see it.

![The booking panel](screens/p11/guide/o07-booking-sheet.png)

## 8. Read the Schedule, and block time

**Schedule** shows the day with a column for each chair. Hatched boxes are blocks,
grey is time off, and a red line is now. Tap an empty time to start a booking
there. Use **Week** for a table of counts; tap a day to open it.

![The schedule, day](screens/p11/guide/o08-schedule-day.png)

![The schedule, week](screens/p11/guide/o09-schedule-week.png)

To block time:

1. Tap **Block time** in the quick actions.
2. Pick the barber, then **Block** (a break or lunch) or **Time off**.
3. Pick the day, the start and the end, and an optional reason only staff see.
4. Tap **Block this time**.

If clients are already booked in that time, you are taken to the decision screen
instead of the block being saved. Nothing changes until you decide.

![Block time](screens/p11/guide/o10-block-time.png)

## 9. Decide when a barber is out

When a barber taps "I am out today", or asks for days off that have bookings, a
red strip appears on the Overview. Their clients stay booked until you decide.

1. Tap **Decide**.
2. For each client, choose one:
   - **Move** puts them with another barber at the same time. Only chairs that
     do the service and are free the whole time are offered.
   - **Keep** leaves them where they are.
   - **Cancel** cancels without emailing.
   - **Cancel and notify** cancels and emails the customer.
3. Tap **Save decisions**. You can decide some now and the rest later.

![The red strip](screens/p11/guide/o11-alert.png)

![Deciding for each client](screens/p11/guide/o12-resolver.png)

A short recording of this is in `docs/screens/p11/recordings/owner-resolves-alert.webm`.

## 10. Customers and notes

1. Tap **Customers**. People are grouped by phone number.
2. Search, or tap a column heading to sort.
3. Tap a person to see their visits and a private note. Type the note and save.

![The customer list](screens/p11/guide/o13-customers.png)

![One customer](screens/p11/guide/o14-customer-sheet.png)

## 11. Team and barber logins

**Team** has a card per barber. The **In today** and **Off today** switch takes a
barber off the booking page for the day. Tap a name for Profile, Services,
Working hours, Time off and Access.

![The team](screens/p11/guide/o15-team.png)

To give a barber their login:

1. Open the barber, tap **Access**.
2. Tap **Copy setup link** and send it to them (text or message). It works once
   and stops after 72 hours.
3. They open it, choose a 6 digit PIN and type it again. They are signed in.

**Reset PIN** deletes the PIN, signs the barber out everywhere and ends old
links. Use it when a barber forgets or leaves a phone behind. After five wrong
PINs a barber is locked for 15 minutes; **Unlock** lets them in sooner. You never
see a PIN.

![A barber's Access tab](screens/p11/guide/o16-team-access.png)

## 12. Website and Settings

**Website** has five tabs, each with **View on site**:

1. **Hours**: weekly hours, closed days and special days.
2. **Announcement**: the strip across the top of the site.
3. **Services**: add, edit, hide and reorder (arrows or drag). Prices are in
   dollars and stored as cents.
4. **Home photo**: choose a photo; you see how it crops on a phone and a computer.
5. **Gallery**: add several photos, write what is in each (required, it is read
   aloud to people who cannot see), tag the barber, reorder, edit, remove.

![Hours](screens/p11/guide/o17-website-hours.png)

![Services](screens/p11/guide/o17-website-services.png)

![Gallery](screens/p11/guide/o17-website-gallery.png)

**Settings** has Shop info (address, phone, and the Instagram, TikTok and
Facebook links; a link shows in the website footer only when you fill it in),
Booking rules, Account (change email or password, light or dark, sign out
everywhere) and Email.

![Shop info](screens/p11/guide/o18-settings-shop.png)

![Booking rules](screens/p11/guide/o18-settings-rules.png)

![Account](screens/p11/guide/o18-settings-account.png)

## 13. Who to call when something is wrong

Tell Visualize first: **contact@visualizeclients.com**. Include what you tapped,
what you expected and what happened, and a screenshot if you can. If the site is
down, customers see a notice with the shop's phone number, so they can still call.

On the Demo site only: a notice says "This is a demo" the first time someone
opens it in a browser session. It never shows on the real site.
