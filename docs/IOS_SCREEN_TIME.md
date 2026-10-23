# iPhone Screen Time logging

## What the website supports

LiveYours can record a daily Screen Time total for therapist-mode context. Screen Time is not included in the study, gym, or run analytics. Read the total from **Settings → Screen Time → See All App & Website Activity**, then open **Log → Screen Time** and enter the hours and minutes. This is a manual self-report; the site does not receive Screen Time data from iOS.

## Add a one-tap iPhone Shortcut

1. Open Apple Shortcuts and create a new shortcut named **Log Screen Time**.
2. Add the **Open URLs** action with `https://YOUR-LIVEYOURS-DOMAIN/log?capture=screen-time`, replacing the hostname with your deployment's domain.
3. Run it once and sign in to LiveYours if asked. Add the shortcut to the Home Screen or a widget from its details menu.
4. Check the daily total in iPhone Settings, run the shortcut, enter that total, then save.

The shortcut only opens the preselected LiveYours form. iOS Shortcuts does not expose a built-in action that reads Screen Time totals to a website. Automatic app-usage access requires a native iOS app using Apple's Screen Time frameworks and user authorization; distribution also requires Apple's Family Controls entitlement approval. Until that native integration exists, LiveYours must not claim that usage is imported automatically.

Therapist mode receives only the last seven days of manually entered daily totals, summarized with their dates. If cloud AI fallback is enabled, that context can be sent to the configured external provider, as the chat privacy notice explains.
