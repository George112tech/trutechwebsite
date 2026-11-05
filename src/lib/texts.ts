// Every piece of text shown on the website, with its default wording. The
// admin (Site text) saves changed wording in site_settings.data.texts as
// { key: text }; anything not changed there uses the default below.
//
// Kinds:
//   line  one line
//   hl    one line; words between *stars* are shown in orange
//   text  a few lines (line breaks kept)
//   paras paragraphs, separated by a blank line
//   list  one item per line
//   md    a document with simple formatting (## heading, - list, **bold**, [link](url))

export type Kind = 'line' | 'hl' | 'text' | 'paras' | 'list' | 'md';
export type Field = { key: string; label: string; kind: Kind; value: string; hint?: string };
export type Group = { id: string; title: string; fields: Field[] };

const f = (key: string, label: string, value: string, kind: Kind = 'line', hint?: string): Field => ({ key, label, kind, value, hint });

const SERVICES = [
  {
    title: 'Websites & web apps',
    text: 'Responsive, lightweight websites and web applications that work well on phones and computers, with accounts, forms, dashboards and navigation.',
    points: ['Business & personal websites', 'Login, registration & dashboards', 'GitHub Pages hosting & custom domains'],
  },
  {
    title: 'Management systems',
    text: 'Database-driven systems that run real operations: records, roles and permissions, reports, attendance, fees and admin panels.',
    points: ['School management', 'Dues & group finance', 'Role-based access with Supabase'],
  },
  {
    title: 'Digital commerce & payments',
    text: 'Online storefronts and services with secure accounts, Paystack payments, API integrations, order tracking and agent systems.',
    points: ['Paystack & mobile money', 'API integrations', 'Orders, agents & withdrawals'],
  },
  {
    title: 'Branding & graphic design',
    text: 'Logos, brand identities, flyers, banners and event graphics with consistent colour and sharp, print-ready output.',
    points: ['Logos & brand identity', 'Flyers, banners & adverts', 'Photo editing & retouching'],
  },
  {
    title: 'IT support & ICT training',
    text: 'Hands-on troubleshooting, hardware upgrades and ICT lessons that help people and schools use technology with confidence.',
    points: ['Windows & device troubleshooting', 'RAM & SSD upgrades', 'ICT lessons & training'],
  },
];

const PROCESS = [
  ['Understand the need', 'What problem should this solve, and for whom? We agree on the goal before anything is built.'],
  ['Design the experience', 'Interfaces, brand and flows, shaped around how your users will actually use it.'],
  ['Build & connect', 'Accounts, data, payments and integrations: implemented, tested and secured.'],
  ['Launch & support', 'Deployment, training and maintenance, so it keeps working after go-live.'],
];

const STATS = [
  ['5', 'Service areas'],
  ['4', 'Systems & platforms in progress'],
  ['2', 'Brands built: Trutech & TRU DATA'],
];

const ROLES = [
  ['Web application developer', 'Dashboards, user accounts, records, databases and business workflows.'],
  ['Technology entrepreneur', 'Digital services and online business models through Trutech Business and TRU DATA.'],
  ['Graphic designer', 'Branding, marketing graphics and image assets for businesses and institutions.'],
  ['IT support & problem-solver', 'Software errors, device compatibility, computer upgrades and installation problems.'],
  ['Educational technology practitioner', 'Connecting computing to classroom teaching, school administration and learning materials.'],
];

const TOOLKIT: [string, string[]][] = [
  ['Web development', ['Visual Studio Code', 'HTML', 'CSS', 'JavaScript', 'Framer', 'GitHub Pages']],
  ['Backend & data', ['Supabase', 'PostgreSQL', 'Authentication', 'Row Level Security']],
  ['Payments & integrations', ['Paystack', 'Refer2Bundle API', 'AdSense', 'AdMob']],
  ['Design', ['Affinity by Canva', 'Framer']],
  ['Mobile & hardware', ['Android APK workflows', 'Android SDK', 'Windows 11 diagnostics', 'RAM & SSD upgrades']],
  ['Vector & production', ['Inkscape', 'Ink/Stitch', 'SVG']],
];

const TERMS = `These terms apply when you use this website or hire {brand} (“we”, “us”) for websites, web applications, management systems, graphic design, IT support or training. By using the website or accepting a quote, you agree to them. Anything we agree with you in writing for a specific project, including by WhatsApp or email, takes priority over these terms.

## 1. Projects and quotes

- Before we start, we agree the scope, price and timeline of the project in writing.
- Quotes are valid for 14 days unless they say otherwise.
- Work outside the agreed scope is quoted and charged separately.

## 2. Payment

- Unless we agree otherwise, a 50% deposit is due before work begins and the balance before final files are released or a site or system goes live.
- Payments are in Ghana cedis by mobile money, bank transfer or an online payment link.
- Fees for third-party services (domains, hosting, paid plugins, SMS or payment providers) are paid by you unless the quote includes them.

## 3. Your part

- You provide the content, information and approvals we need, on time.
- You confirm you have the right to use any logos, photos, text or data you give us.
- Delays in providing content or feedback may move the delivery date.

## 4. Reviews, revisions and approval

- We share drafts through a private link where you can view the work, request changes or approve it.
- Each project includes two rounds of revisions unless we agree otherwise; further changes are charged.
- Approving the work through your private link, WhatsApp or email confirms that it’s accepted.

## 5. Private links and files

- Your private link is for you and your team. Please don’t share it publicly; anyone with the link can open it.
- Files marked view only are for review. They may not be downloaded, copied, screenshotted or used until the work is approved and paid for.
- Links may be switched off or set to expire. Please download your final files when you receive them; we keep them for a limited time (see our [Privacy Policy]({base}privacy/)).

## 6. Ownership

- When the project is paid in full, you own the final approved deliverables made for you.
- We keep ownership of drafts and unused concepts, and of our own tools, templates and reusable code, which we license to you for use in your project.
- Fonts, stock images, plugins and other third-party materials stay under their own licences.

## 7. Our portfolio

We may show completed work in our portfolio and on social media, unless you ask us in writing not to. We never show confidential information, private data or work that isn’t public yet.

## 8. Support

For websites and systems, we fix bugs in the work we delivered free of charge for 30 days after launch. Ongoing maintenance, hosting management and new features are available by separate agreement.

## 9. Cancellation

Either of us can end a project by telling the other in writing. The deposit isn’t refundable once work has started, and work completed up to the cancellation is charged.

## 10. Liability

We do our work with reasonable care and skill. We aren’t responsible for problems caused by third-party services (such as hosting, payment providers or APIs), by changes made by others, or for indirect losses such as lost profits. Our total liability for a project is limited to the amount you paid for it.

## 11. This website

The text, designs and images on this website belong to {brand} or to the clients they were made for. You may not copy or reuse them without permission, or use the website in a way that harms it or others.

## 12. Law and changes

These terms are governed by the laws of Ghana. We may update them; the version on this page at the time you accept a quote applies to that project.

## Contact

Questions about these terms? Contact us at {email}.`;

const PRIVACY = `This policy explains what personal information {brand} (“we”, “us”) collects when you use this website or work with us, why we collect it, and the choices you have. We handle personal information in line with Ghana’s Data Protection Act, 2012 (Act 843).

## Who we are

{brand} is a technology and design business based in {location}. You can reach us at {email} or {phone}.

## Browsing this website

- The website has no user accounts, advertising or analytics trackers, and it doesn’t set cookies.
- If you switch between light and dark mode, your choice is saved in your own browser only.
- Like any website, the services that deliver it receive technical information such as your IP address and browser type: GitHub Pages (hosting) and Supabase (portfolio content and images). Fonts are served from this website, not from a third party.

## When you contact us

The contact form doesn’t store anything on this website. It opens WhatsApp or your email app with your message ready to send, so we receive only what you choose to send: usually your name, contact details and project details. WhatsApp and your email provider handle your message under their own privacy policies.

## When you’re our client

To deliver and review your work, we keep:

- your name, and your WhatsApp number if you give it to us;
- the project title, our messages to you and the files we prepare for you;
- the feedback, approvals and ratings you send through your private link;
- when your private link was first opened.

This information is stored with Supabase, our database and file storage provider, on servers in London, United Kingdom. Your files can only be opened through your private link, which we can switch off, replace or set to expire, and only the {brand} administrator can manage them.

## Why we use your information

- to reply to you and prepare quotes;
- to deliver, review and support the work you asked for;
- to keep business records such as approvals and payments;
- to show completed work in our portfolio, as described in our [Terms]({base}terms/).

We don’t sell personal information or use it for advertising.

## Who we share it with

Only the service providers that run this website and our work: Supabase (database and files), GitHub (website hosting) and WhatsApp or email when you use them to talk to us. We may also share information when the law requires it.

## How long we keep it

We keep client files for as long as we need them to deliver and support your project, usually up to 12 months after delivery, then delete them. We keep approvals, reviews and payment records as business records. You can ask us to delete your information sooner.

## Your rights

You can ask to see the personal information we hold about you, to correct it, or to delete it, and you can withdraw any consent you gave. Contact us using the details above. If you’re not satisfied with our answer, you can complain to the Data Protection Commission of Ghana.

## Children

Our services are for businesses, schools and adults. Work for schools is arranged with the school, not with students directly.

## Changes

If we change this policy, we’ll update it on this page and change the date at the top.`;

const HL = 'Words between *stars* are shown in orange.';
const LIST = 'One per line.';

export const GROUPS: Group[] = [
  {
    id: 'general',
    title: 'Whole site: menu, footer and brand',
    fields: [
      f('brand.tagline', 'Tagline', 'Where ideas turn into reality.', 'line', 'Shown in the footer and on the About page.'),
      f('brand.description', 'Description for Google and link previews', 'Practical digital solutions for businesses, schools and people in Ghana: websites, management systems, online platforms and brand identities.', 'text'),
      f('brand.whatsappHello', 'First message when someone taps a WhatsApp link', 'Hello! I found you through the Trutech Business website.', 'text'),
      f('nav.home', 'Menu: Home', 'Home'),
      f('nav.services', 'Menu: Services', 'Services'),
      f('nav.work', 'Menu: Work', 'Work'),
      f('nav.about', 'Menu: About', 'About'),
      f('nav.contact', 'Menu: Contact', 'Contact'),
      f('footer.explore', 'Footer heading: links', 'Explore'),
      f('footer.contact', 'Footer heading: contact', 'Get in touch'),
      f('footer.follow', 'Footer heading: social', 'Follow'),
      f('footer.rights', 'Footer: after the copyright', 'All rights reserved.'),
      f('footer.terms', 'Footer link: terms', 'Terms'),
      f('footer.privacy', 'Footer link: privacy', 'Privacy'),
    ],
  },
  {
    id: 'home-hero',
    title: 'Home page: top section',
    fields: [
      f('home.badge', 'Small orange line above the title', 'Web developer · Designer · IT support'),
      f('home.title', 'Main title', 'Ideas into *Reality*', 'hl', HL),
      f('home.sub', 'Line under the title', 'Digital solutions practitioner based in Ghana'),
      f('home.ctaHire', 'White button', 'Hire me'),
      f('home.ctaWork', 'Outline button', 'See my work'),
      f('home.proofTitle', 'Card on the right: title', '5 service areas'),
      f('home.proofText', 'Card on the right: text', 'Websites, systems, commerce,\nbranding and IT support', 'text'),
      f('home.wordmark', 'Giant word behind your photo (also at the top of other pages and in the footer)', 'TRUTECH'),
    ],
  },
  {
    id: 'home-sections',
    title: 'Home page: sections',
    fields: [
      f('home.services.label', 'Services: label', 'My Services'),
      f('home.services.title', 'Services: title', 'How I Bring *Ideas to Life*', 'hl', HL),
      f('home.services.more', 'Services: button', 'View all services'),
      f('home.about.label', 'About: label', 'About Me'),
      f('home.about.title', 'About: title', 'Who is *Trutech Business?*', 'hl', HL),
      f(
        'home.about.text',
        'About: text',
        'I am a technology entrepreneur and digital solutions practitioner working across web development, software solutions, graphic design, IT support and educational technology. Everything I build starts from a real need: what problem it solves, how people will use it, and how it will be run.',
        'text',
      ),
      f('home.about.more', 'About: white button', 'More about me'),
      f('home.about.contact', 'About: outline button', 'Contact me'),
      f('home.about.chips', 'About: pills on the photo card', 'Websites\nSystems', 'list', LIST),
      f('home.work.label', 'Selected work: label', 'Selected Work'),
      f('home.work.title', 'Selected work: title', 'Systems, Platforms *& Brands*', 'hl', HL),
      f('home.work.more', 'Selected work: button', 'View all work'),
      f('home.process.label', 'Process: label', 'How I Work'),
      f('home.process.title', 'Process: title', 'From the first conversation *to launch*', 'hl', HL),
      f('home.cta.title', 'Closing section: title', 'Have an idea? Let’s turn it into reality.'),
      f(
        'home.cta.text',
        'Closing section: text',
        'Tell me what you need, whether it’s a website, a system, a brand or help with your devices, and I’ll get back to you within a day.',
        'text',
      ),
      f('home.cta.button', 'Closing section: button', 'Start a project'),
    ],
  },
  {
    id: 'services',
    title: 'Services (home page and Services page)',
    fields: SERVICES.flatMap((s, i) => [
      f(`service.${i + 1}.title`, `Service ${i + 1}: name`, s.title),
      f(`service.${i + 1}.text`, `Service ${i + 1}: description`, s.text, 'text'),
      f(`service.${i + 1}.points`, `Service ${i + 1}: tags`, s.points.join('\n'), 'list', LIST),
    ]),
  },
  {
    id: 'process',
    title: 'Process steps (home page)',
    fields: PROCESS.flatMap(([title, text], i) => [
      f(`process.${i + 1}.title`, `Step ${i + 1}: title`, title),
      f(`process.${i + 1}.text`, `Step ${i + 1}: text`, text, 'text'),
    ]),
  },
  {
    id: 'stats',
    title: 'Numbers (home page)',
    fields: STATS.flatMap(([value, label], i) => [
      f(`stat.${i + 1}.value`, `Number ${i + 1}`, value, 'line', 'A “+” is added after it.'),
      f(`stat.${i + 1}.label`, `Number ${i + 1}: label`, label),
    ]),
  },
  {
    id: 'services-page',
    title: 'Services page',
    fields: [
      f('servicesPage.eyebrow', 'Label', 'Services'),
      f('servicesPage.title', 'Title', 'Everything you need to go digital.'),
      f('servicesPage.lead', 'Intro', 'From your brand and website to the systems that run your business, built and supported by one person who understands the whole picture.', 'text'),
      f('servicesPage.askTitle', 'Bottom section: title', 'Not sure what you need?'),
      f('servicesPage.askText', 'Bottom section: text', 'Describe the problem and I’ll suggest the simplest thing that solves it.', 'text'),
      f('servicesPage.askButton', 'Bottom section: button', 'Talk to me'),
    ],
  },
  {
    id: 'work-page',
    title: 'Work page and project pages',
    fields: [
      f('workPage.eyebrow', 'Label', 'Portfolio'),
      f('workPage.title', 'Title', 'Work built for real needs.'),
      f('workPage.lead', 'Intro', 'Websites, management systems, digital commerce and graphic design, each with an honest note on where it stands.', 'text'),
      f('workPage.all', 'Filter: all projects', 'All'),
      f('project.back', 'Project page: back link', 'All work'),
      f('project.client', 'Project page: “Client”', 'Client'),
      f('project.year', 'Project page: “Year”', 'Year'),
      f('project.status', 'Project page: “Status”', 'Status'),
      f('project.link', 'Project page: “Link”', 'Link'),
      f('project.visit', 'Project page: link text', 'Visit site'),
      f('project.services', 'Project page: services heading', 'Services'),
      f('project.next', 'Project page: next project', 'Next project'),
      f('project.missingTitle', 'Removed project: title', 'This project isn’t available.'),
      f('project.missingText', 'Removed project: text', 'It may have been removed or renamed.', 'text'),
      f('project.missingButton', 'Removed project: button', 'See all work'),
    ],
  },
  {
    id: 'about-page',
    title: 'About page',
    fields: [
      f('about.eyebrow', 'Label', 'About'),
      f('about.title', 'Title', 'The person behind Trutech Business.', 'line', 'With your name set in Settings, write it here, for example “Hi, I’m Ama.”'),
      f('about.lead', 'Line under the title', 'Technology entrepreneur & digital solutions practitioner'),
      f(
        'about.story',
        'Your story',
        [
          'I am a technology entrepreneur and digital solutions practitioner working across web development, software solutions, graphic design, IT support and educational technology.',
          'Through Trutech Business I use technology and creativity to build practical solutions for businesses, schools and individuals: responsive websites, database-driven management systems, administrative dashboards, payment and API integrations, and platforms for online services. I am also building TRU DATA, a digital commerce platform for mobile data bundles.',
          'I also work in brand identity and promotional design, computer hardware and troubleshooting, and as an ICT teacher. Everything I build starts from a real need: what problem it solves, how people will use it, and how it will be run and maintained.',
        ].join('\n\n'),
        'paras',
        'Leave an empty line between paragraphs.',
      ),
      f('about.rolesLabel', 'Roles: label', 'Five roles, one direction'),
      f('about.rolesTitle', 'Roles: title', 'Designing, building and supporting digital solutions.'),
      ...ROLES.flatMap(([title, text], i) => [f(`role.${i + 1}.title`, `Role ${i + 1}: title`, title), f(`role.${i + 1}.text`, `Role ${i + 1}: text`, text, 'text')]),
      f('about.toolkitLabel', 'Toolkit: label', 'Toolkit'),
      f('about.toolkitTitle', 'Toolkit: title', 'Tools I build with.'),
      f('about.toolkitNote', 'Toolkit: note', 'Used, explored or in progress; I keep learning as the work demands.', 'text'),
      ...TOOLKIT.flatMap(([area, tools], i) => [f(`tool.${i + 1}.area`, `Toolkit ${i + 1}: area`, area), f(`tool.${i + 1}.tools`, `Toolkit ${i + 1}: tools`, tools.join('\n'), 'list', LIST)]),
      f('about.mindLabel', 'Last section: label', 'How I think'),
      f('about.mindTitle', 'Last section: title', 'I start from the real need.'),
      f(
        'about.mindText',
        'Last section: text',
        'Before writing code I ask: what problem does it solve? What should it look like? How will people sign in? Where is the data stored? How will payments work? How will it be run, deployed and maintained?',
        'text',
      ),
      f('about.mindButton', 'Last section: button', 'Work with me'),
    ],
  },
  {
    id: 'contact-page',
    title: 'Contact page',
    fields: [
      f('contact.eyebrow', 'Label', 'Contact'),
      f('contact.title', 'Title', 'Let’s turn your idea into reality.'),
      f('contact.lead', 'Intro', 'Tell me a little about what you need. I usually reply within a day.', 'text'),
      f('contact.name', 'Form: name label', 'Your name'),
      f('contact.need', 'Form: service label', 'What do you need?'),
      f('contact.other', 'Form: last service option', 'Something else'),
      f('contact.details', 'Form: details label', 'Project details'),
      f('contact.placeholder', 'Form: details placeholder', 'What are you trying to achieve, and by when?'),
      f('contact.hint', 'Form: note under the box', 'Your message opens in WhatsApp or your email app, ready to send. Nothing is stored on this website.', 'text'),
      f('contact.privacy', 'Form: privacy link', 'See our Privacy Policy.'),
      f('contact.whatsapp', 'Form: WhatsApp button', 'Send on WhatsApp'),
      f('contact.email', 'Form: email button', 'Send by email'),
      f('contact.notice', 'Shown when no contact details are set', 'Contact details are being set up. Please check back soon.', 'text'),
      f('contact.ways', 'Side heading', 'Other ways to reach me'),
      f('contact.greeting', 'Message: greeting', 'Hello Trutech Business,'),
      f('contact.myName', 'Message: name line', 'My name is {name}.', 'line', '{name} is replaced by the visitor’s name.'),
      f('contact.iNeed', 'Message: service line', 'I need: {service}', 'line', '{service} is replaced by the chosen service.'),
      f('contact.subject', 'Email subject', 'New project: {service}', 'line', '{service} is replaced by the chosen service.'),
    ],
  },
  {
    id: 'legal',
    title: 'Terms and Privacy',
    fields: [
      f('legal.eyebrow', 'Label above the title', 'Legal'),
      f('legal.updated', 'Date line', 'Last updated {date}', 'line', '{date} is replaced by the date below.'),
      f('terms.title', 'Terms: title', 'Terms of Service'),
      f('terms.updated', 'Terms: last updated', '21 October 2026'),
      f('terms.body', 'Terms: text', TERMS, 'md', 'Use ## for a heading, - for a list item, **bold** and [link text](https://…). {brand}, {email}, {phone} and {location} are filled in from Settings.'),
      f('privacy.title', 'Privacy: title', 'Privacy Policy'),
      f('privacy.updated', 'Privacy: last updated', '23 October 2026'),
      f('privacy.body', 'Privacy: text', PRIVACY, 'md', 'Use ## for a heading, - for a list item, **bold** and [link text](https://…). {brand}, {email}, {phone} and {location} are filled in from Settings.'),
    ],
  },
  {
    id: 'notfound',
    title: 'Page not found (404)',
    fields: [
      f('404.eyebrow', 'Label', '404'),
      f('404.title', 'Title', 'This page didn’t grow here.'),
      f('404.lead', 'Text', 'The link may be old or mistyped.', 'text'),
      f('404.button', 'Button', 'Back to home'),
    ],
  },
  {
    id: 'client',
    title: 'Client page (private links)',
    fields: [
      f('client.private', 'Top bar', 'Private link'),
      f('client.files', 'Files heading', 'Files'),
      f('client.noFiles', 'When there are no files yet', 'Files will appear here soon.'),
      f('client.download', 'Download button', 'Download'),
      f('client.downloadsTitle', 'Download links: heading', 'Download your files'),
      f('client.downloadsIntro', 'Download links: text', 'Each format downloads on its own. Pick the ones you need.', 'text'),
      f('client.downloadAs', 'Download links: button ({format} is the file format)', 'Download {format}'),
      f('client.viewPdf', 'PDF button', 'View PDF'),
      f('client.viewOnly', 'View-only label', 'view only'),
      f('client.viewOnlyNote', 'View-only file note', 'View only: you’ll receive this file once the work is approved.', 'text'),
      f('client.fullScreen', 'View-only files: full-screen button', 'View full screen'),
      f('client.close', 'Full-screen view: close button', 'Close'),
      f('client.zoomIn', 'Full-screen view: zoom in (for screen readers)', 'Zoom in'),
      f('client.zoomOut', 'Full-screen view: zoom out (for screen readers)', 'Zoom out'),
      f('client.feedbackTitle', 'Review links: form title', 'Your feedback'),
      f('client.feedbackIntro', 'Review links: form intro', 'Approve the work, or tell me what you’d like changed.', 'text'),
      f('client.reviewTitle', 'Delivery links: form title', 'Leave a review'),
      f('client.reviewIntro', 'Delivery links: form intro', 'Let me know you have everything, and how the work went.', 'text'),
      f('client.name', 'Form: name label', 'Your name'),
      f('client.decision', 'Form: decision label', 'Your decision'),
      f('client.approve', 'Form: approve', 'Approve'),
      f('client.approveNote', 'Form: approve note', 'It’s ready'),
      f('client.changes', 'Form: request changes', 'Request changes'),
      f('client.changesNote', 'Form: request changes note', 'Tell me what to change'),
      f('client.rating', 'Form: rating label', 'Your rating'),
      f('client.comments', 'Form: comments label (review)', 'Comments'),
      f('client.reviewComments', 'Form: comments label (delivery)', 'Your review (optional)'),
      f('client.placeholder', 'Form: comments placeholder', 'What do you like, and what should change?'),
      f('client.send', 'Form: send button', 'Send feedback'),
      f('client.sending', 'Form: while sending', 'Sending…'),
      f('client.hint', 'Form: note under the button', 'Your feedback is saved and opens in WhatsApp, ready to send to Trutech Business.', 'text'),
      f('client.agree', 'Form: agreement', 'By sending it you agree to our {terms} and {privacy}.', 'line', '{terms} and {privacy} become links.'),
      f('client.thanksTitle', 'After sending: title', 'Thank you! Your feedback is saved.'),
      f('client.thanksText', 'After sending: text', 'If WhatsApp didn’t open, tap below to send it.', 'text'),
      f('client.thanksButton', 'After sending: button', 'Send on WhatsApp'),
      f('client.earlier', 'Earlier feedback heading', 'Earlier feedback'),
      f('client.foot', 'Note at the bottom', 'These files were prepared for you by Trutech Business. Please don’t share this link: anyone with it can view them.', 'text'),
      f('client.status.awaiting', 'Status: awaiting review', 'Awaiting your review'),
      f('client.status.changes', 'Status: changes requested', 'Changes requested'),
      f('client.status.approved', 'Status: approved', 'Approved'),
      f('client.status.delivered', 'Status: delivered', 'Delivered'),
      f('client.errorTitle', 'Link problem: title', 'We couldn’t open this link.'),
      f('client.errorButton', 'Link problem: button', 'Contact Trutech Business'),
      f('client.errIncomplete', 'Link problem: incomplete link', 'This link is incomplete. Please use the full link you were sent.', 'text'),
      f('client.errInactive', 'Link problem: link switched off', 'This link is no longer active. Please contact Trutech Business for a new one.', 'text'),
      f('client.errNetwork', 'Link problem: no connection', 'We couldn’t reach the server. Please check your connection and try again.', 'text'),
      f('client.errName', 'Form error: no name', 'Please enter your name.'),
      f('client.errChanges', 'Form error: no changes described', 'Please describe the changes you’d like.'),
      f('client.errSend', 'Form error: not sent', 'Sorry, that didn’t go through. Please check your connection and try again.', 'text'),
      f('client.waHello', 'WhatsApp message: greeting', 'Hello Trutech Business, this is {name}.', 'line', '{name} is replaced by the client’s name.'),
      f('client.waProject', 'WhatsApp message: project line', 'Project: {project}', 'line', '{project} is replaced by the project title.'),
      f('client.waApprove', 'WhatsApp message: approved', '✅ I approve this work.'),
      f('client.waReceived', 'WhatsApp message: files received', 'I have received the files.'),
      f('client.waChanges', 'WhatsApp message: changes', '✏️ I would like some changes.'),
    ],
  },
];

export const FIELDS: Record<string, Field> = Object.fromEntries(GROUPS.flatMap((g) => g.fields.map((x) => [x.key, x])));
export const DEFAULTS: Record<string, string> = Object.fromEntries(Object.values(FIELDS).map((x) => [x.key, x.value]));
export const SERVICE_COUNT = SERVICES.length;
export const PROCESS_COUNT = PROCESS.length;
export const STAT_COUNT = STATS.length;
export const ROLE_COUNT = ROLES.length;
export const TOOL_COUNT = TOOLKIT.length;

export type Texts = Record<string, string>;

/** The wording for a key: the edited text, or the default when it's empty. */
export const textOf = (texts: Texts | undefined, key: string) => {
  const v = texts?.[key];
  return typeof v === 'string' && v.trim() ? v : (DEFAULTS[key] ?? '');
};

/** List fields: one item per line, blank lines dropped. */
export const linesOf = (value: string) =>
  value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

/** Replaces {name} placeholders. Unknown ones are left as they are. */
export const fill = (value: string, vars: Record<string, string>) => value.replace(/\{(\w+)\}/g, (m, n) => vars[n] ?? m);
