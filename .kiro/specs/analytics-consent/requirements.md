# Requirements Document

## Project Description (Input)
CardápioFC visitors in six editions (Global, UK, Ireland, Brazil, Portugal, Argentina) are measured by a misconfigured setup: GA4 `G-667SFTMKPH` is loaded via gtag while a Google Tag Manager loader is fed a GA4 measurement ID (`G-4PSY14GVNT`), and there are no meaningful product events. Going worldwide (UK, IE, PT) requires GDPR/UK-GDPR-compliant consent. The site operator needs a single, correctly configured GA4 property, Google Consent Mode v2 with a lightweight localised consent banner (denied by default for EEA/UK visitors), a cookieless Cloudflare Web Analytics baseline, key product events with the edition as a parameter (app open, store click, channel click, search, edition switch, geo-redirect landing, share), zero advertisements across the entire site (no AdSense, no ad slots, no ads.txt), and a privacy policy per edition — all without measurable LCP regression on a static, €0-hosted site.

## Introduction
This specification defines how the CardápioFC website measures usage and honours consent across its six editions. Primary actors are **visitors** (who must be asked for consent where the law requires it and must be able to change their mind), the **site operator** (who configures measurement identifiers and reads reports) and **downstream spec implementers** (app-deeplinks and data-pages, which emit trackable markup that this feature measures).

The subject "Analytics Consent Layer" denotes the website behaviour delivered by this feature; "consent region" means the European Economic Area (EU member states, Iceland, Liechtenstein, Norway), the United Kingdom and Switzerland.

## Boundary Context
- **In scope**: GA4 configuration (single measurement ID), removal of the GA4-in-GTM misconfiguration, consent defaults and region-aware behaviour, the consent banner and consent settings, Cloudflare Web Analytics baseline, product event taxonomy and measurement, geo-landing measurement, advertisement-free invariant (clean AdSense neutralisation, no ad slots, no ads.txt), privacy policy pages per edition, analytics-specific verification checks.
- **Out of scope**: Advertising networks / AdSense / ads.txt (explicit non-goal; zero ads on site); SEO tags, canonical/hreflang, Open Graph and structured data (seo-social); hosting, response headers including Content-Security-Policy, geo-redirect rules (edge-delivery); search page, app landing pages, smart app banner, deep links (app-deeplinks); match/team/league page templates (data-pages); mobile app analytics; server-side tagging; a Google Tag Manager container.
- **Adjacent expectations**: site-foundation provides head/body/footer extension points, the edition registry, interface strings and the `data-cfc-event` markup on match cards, channel badges and the edition switcher. app-deeplinks marks app-open, store-link, share and search interactions using the event vocabulary defined here. edge-delivery marks geo-redirected landings, allows the third-party origins this feature needs in any security policy it serves, and (if used) leaves Cloudflare Web Analytics automatic injection disabled when the site embeds the beacon itself.

## Requirements

### Requirement 1: Measurement Configuration
**Objective:** As a site operator, I want exactly one GA4 property configured in one place, so that reports are complete and the current misconfiguration cannot recur.

#### Acceptance Criteria
1. The Analytics Consent Layer shall read the GA4 measurement ID from a single configuration value that applies to all editions.
2. If the configured GA4 measurement ID does not match the GA4 format (`G-` followed by upper-case letters and digits), then the Site Build shall fail with a message naming the offending value.
3. If the GA4 measurement ID is empty, the Analytics Consent Layer shall emit no Google Analytics code and the Site Build shall still succeed with a warning.
4. The Analytics Consent Layer shall not emit a Google Tag Manager container loader or its no-script frame on any page.
5. If any configuration value intended for a Google Tag Manager container contains a GA4 measurement ID, then the Site Build shall fail with a message explaining the misconfiguration.
6. The Analytics Consent Layer shall ensure that no pre-existing theme or module code path emits Google Analytics, Google Tag Manager, AdSense or cookie-banner output on any page.
7. While the build runs in a non-production environment, the Analytics Consent Layer shall send no data to Google Analytics, AdSense or Cloudflare Web Analytics.

### Requirement 2: Consent Defaults and Region Awareness
**Objective:** As a visitor in the consent region, I want analytics and advertising storage to be off until I agree, so that my privacy rights are respected; as an operator, I want visitors elsewhere measured where lawful.

#### Acceptance Criteria
1. The Analytics Consent Layer shall establish default consent states for analytics storage, advertising storage, advertising user data and advertising personalisation before any Google tag runs on the page.
2. When a visitor located in the consent region opens any page, the Analytics Consent Layer shall default all four consent states to denied, regardless of which edition the visitor is reading.
3. When a visitor located outside the consent region opens any page, the Analytics Consent Layer shall apply the operator-configured default for visitors outside the consent region (launch value: granted).
4. When a visitor who previously recorded a consent choice opens any page, the Analytics Consent Layer shall apply that choice before any Google tag sends data.
5. Where the visitor's browser signals Global Privacy Control and the visitor has not recorded a choice, the Analytics Consent Layer shall default advertising user data and advertising personalisation to denied.
6. The Analytics Consent Layer shall keep the list of consent-region countries and the outside-region default in configuration so that legal changes need no template change.

### Requirement 3: Consent Banner
**Objective:** As a visitor who must be asked, I want a short, clear, localised choice with equally easy accept and reject options, so that I can decide quickly without being nudged.

#### Acceptance Criteria
1. When a visitor without a recorded choice opens a page of an edition whose country is in the consent region, the Analytics Consent Layer shall display the consent banner.
2. When a visitor without a recorded choice opens a page of any other edition and the visitor's device time zone is a European time zone, the Analytics Consent Layer shall display the consent banner.
3. The consent banner shall offer "accept all", "reject all" and "customise" actions, with "accept all" and "reject all" presented with equal visual prominence and in the same layer.
4. When the visitor selects "customise", the consent banner shall present separate choices for analytics and for advertising, both off by default, and a control to save the selection.
5. The consent banner shall show its text in the edition's language and regional variant, state the purposes (analytics, advertising), and link to the edition's privacy policy.
6. The consent banner shall be operable by keyboard alone, expose its controls with accessible names, keep a visible focus indicator and meet the site's colour-contrast rules.
7. The consent banner shall not shift page content when it appears or disappears, and shall not become the page's largest contentful element in a standard mobile Lighthouse run of the edition home page.
8. While the consent banner is displayed and no choice is made, the Analytics Consent Layer shall keep all four consent states at their defaults and shall not record a choice when the visitor scrolls, navigates or closes the banner without choosing.
9. If the browser has scripting disabled, the Analytics Consent Layer shall not display the consent banner and shall load no analytics or advertising scripts.
10. The consent banner shall not prevent the visitor from reading or navigating the page before making a choice.

### Requirement 4: Consent Choice Lifecycle
**Objective:** As a visitor, I want my choice remembered across editions and easy to change at any time, so that I am not asked repeatedly and can withdraw consent as easily as I gave it.

#### Acceptance Criteria
1. When the visitor makes a choice in the consent banner, the Analytics Consent Layer shall update the four consent states immediately, hide the banner and store the choice on the visitor's device with the date and the consent policy version.
2. The Analytics Consent Layer shall apply a stored choice on every edition of the site without asking again.
3. When the stored choice is older than the configured retention period (launch value: 180 days) or was recorded under an older consent policy version, the Analytics Consent Layer shall discard it and treat the visitor as having no recorded choice.
4. The Analytics Consent Layer shall display a "cookie settings" control in the footer of every page that reopens the consent choices showing the current selection.
5. When the visitor withdraws analytics consent, the Analytics Consent Layer shall update the analytics consent state to denied and delete the first-party Google Analytics cookies on the site's domain.
6. When the visitor withdraws advertising consent, the Analytics Consent Layer shall update the three advertising consent states to denied and shall request only non-personalised ads for the rest of the visit and later visits.
7. If storing the choice on the device fails, the Analytics Consent Layer shall apply the choice for the current page and shall not throw visible errors.

### Requirement 5: Google Analytics Page Measurement
**Objective:** As a site operator, I want page views measured per edition without slowing pages, so that I can compare editions and page types.

#### Acceptance Criteria
1. Where a GA4 measurement ID is configured, the Analytics Consent Layer shall record a page view for every page load that is allowed by the visitor's consent state.
2. The Analytics Consent Layer shall attach the edition code and the page type (home, match, team, league, search, app landing, legal, other) to every page view and event.
3. While a visitor is shown the consent banner and has not granted analytics consent, the Analytics Consent Layer shall not load the Google Analytics library.
4. When a visitor who was shown the banner grants analytics consent, the Analytics Consent Layer shall load the Google Analytics library and record the current page view without a page reload.
5. When a visitor who is not shown the banner opens a page, the Analytics Consent Layer shall load the Google Analytics library only after the page has finished loading, so that it does not compete with the page's main content.
6. If the Google Analytics library fails to load or is blocked, the Analytics Consent Layer shall continue to work without errors visible to the visitor and shall not block interactions.

### Requirement 6: Cookieless Baseline
**Objective:** As a site operator, I want an always-on, cookieless traffic baseline, so that I have trustworthy totals even when visitors decline consent or block Google.

#### Acceptance Criteria
1. Where a Cloudflare Web Analytics site token is configured, the Analytics Consent Layer shall include the Cloudflare Web Analytics beacon on every production page regardless of the visitor's consent choice.
2. The Cloudflare Web Analytics baseline shall set no cookies and use no device storage.
3. Where no Cloudflare Web Analytics site token is configured, the Analytics Consent Layer shall emit no beacon and the operator documentation shall state that automatic injection at the Cloudflare zone must then be enabled instead.
4. The Analytics Consent Layer shall ensure that each page is counted by Cloudflare Web Analytics at most once (embedded beacon and automatic injection are never both active, per the operator documentation).
5. The Cloudflare Web Analytics beacon shall load without delaying the page's main content.

### Requirement 7: Product Event Taxonomy and Measurement
**Objective:** As a site operator, I want the key product interactions measured with consistent names and the edition as a parameter, so that I can see how visitors reach channels and the app.

#### Acceptance Criteria
1. When a visitor activates an element marked as a trackable interaction, the Analytics Consent Layer shall send the event defined for that interaction with its defined parameters, the edition code and the page type.
2. The Analytics Consent Layer shall measure at least these interactions: match card open, channel or broadcaster click, edition switch, app open attempt, app store click (iOS and Android distinguished), share click and search query.
3. The Analytics Consent Layer shall publish the event vocabulary (event names, marker attributes and allowed parameter values) for other features to use, and shall ignore markers whose event name is not in the vocabulary.
4. When another feature reports a non-click interaction such as a search query, the Analytics Consent Layer shall accept the report even if it arrives before the measurement code has loaded, and shall send it once measurement is available and allowed.
5. When a search query is reported, the Analytics Consent Layer shall send the query trimmed, lower-cased and limited to 100 characters, together with the number of results, and shall not send queries that look like an email address or phone number.
6. The Analytics Consent Layer shall not send names, email addresses, phone numbers or precise location in any event parameter.
7. While analytics consent is not granted, the Analytics Consent Layer shall send product events only in the cookieless, identifier-free form permitted by the denied consent state, or not at all while the Google Analytics library is not loaded.
8. When an interaction navigates away from the page, the Analytics Consent Layer shall send its event without delaying the navigation.

### Requirement 8: Geo Landing and Edition Choice Measurement
**Objective:** As a site operator, I want to know how often visitors arrive through the automatic country redirect versus a manual edition choice, so that I can judge whether geo-routing serves visitors well.

#### Acceptance Criteria
1. When a visitor lands on a page through the automatic country redirect and the landing address carries the geo-landing marker, the Analytics Consent Layer shall send a geo landing event with the edition code and the marked country when present.
2. When the geo landing event has been recorded or discarded, the Analytics Consent Layer shall remove the geo-landing marker from the visible address without reloading the page.
3. When a visitor lands on the Global edition with the manual edition-choice marker, the Analytics Consent Layer shall attribute the page view to a manual edition choice and shall not send a geo landing event.
4. If the geo-landing marker is absent, the Analytics Consent Layer shall send no geo landing event.

### Requirement 9: Advertisement-Free Invariant and Legacy AdSense Neutralisation
**Objective:** As a site operator, I want the website to be completely free of advertisements, ensuring no ad slots, no ad network scripts, and no ads.txt are published, and legacy theme AdSense configuration is cleanly neutralized.

#### Acceptance Criteria
1. The CardápioFC Site shall contain zero ad slots and zero advertising network scripts across all pages and editions.
2. The legacy theme AdSense module shall be neutralized and disabled in site configuration (`google_adsense = ""`).
3. The CardápioFC Site shall not publish `/ads.txt` or any ad seller verification manifests.
4. Google Consent Mode v2 configuration shall permanently set `ad_storage` and `ad_personalization` to `denied` across all regions.
5. Automated verification checks shall fail if any ad slot element (`.cfc-ad`, `adsbygoogle`), AdSense script reference (`pagead2.googlesyndication.com`), or `ads.txt` file is detected in `public/`.

### Requirement 10: Reserved (Removed — Advertisements Out of Scope)
_This requirement previously governed ads.txt publication. Removed per operator decision: CardápioFC will have zero advertising._

### Requirement 11: Privacy Policy per Edition
**Objective:** As a visitor, I want a privacy policy in my edition's language that explains what is measured and how to change my choice, so that consent is informed.

#### Acceptance Criteria
1. The CardápioFC Site shall publish a privacy policy page for every edition, in that edition's language and regional variant, at the same path within each edition.
2. The privacy policy shall list each active measurement service (Google Analytics 4, Cloudflare Web Analytics), its purpose, whether it uses cookies or device storage, and the consent it depends on.
3. The privacy policy shall explain how to change or withdraw consent and shall provide the "cookie settings" control inline.
4. The privacy policy shall name the data controller and a contact address taken from configuration, and shall name the supervisory authority relevant to the edition's country.
5. When a measurement service is disabled in configuration, the privacy policy shall no longer list it.
6. The CardápioFC Site shall link the privacy policy from the footer of every page and from the consent banner.
7. If the data controller name or contact address is not configured, then the production Site Build shall fail with a message naming the missing value.

### Requirement 12: Performance and Verification
**Objective:** As a site operator, I want measurement and consent to cost almost nothing in page speed and to be verifiable automatically, so that the site stays fast and compliant after changes.

#### Acceptance Criteria
1. The Analytics Consent Layer shall add no render-blocking third-party request and shall not start Google Analytics requests before the page's load event.
2. The first-party code added by this feature shall not exceed 6 KB compressed per page, keeping the site's overall first-party script budget.
3. The Analytics Consent Layer shall not cause a measurable LCP regression: the median of five mobile Lighthouse runs of the edition home page with this feature enabled shall have an LCP within 100 ms of the same median without it, and CLS shall stay at or below 0.1.
4. The Analytics Consent Layer shall provide an automated verification check that fails when: consent defaults do not precede Google tag code in a page; any page contains a tag-manager loader, an advertising script, or an `ads.txt` file; the GA4 identifier in pages differs from configuration; any edition lacks a privacy policy page or footer cookie-settings control; or the added first-party code exceeds its budget.
5. The Analytics Consent Layer shall provide operator documentation covering where to set each identifier, how to register the edition and page type as custom dimensions in GA4, how to choose between embedded and automatic Cloudflare Web Analytics, and the open decisions listed in this specification.
