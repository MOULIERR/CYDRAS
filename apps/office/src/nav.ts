// The office menu, same sections and order as the mockup.
// path = a real page that works now; without a path the item opens a "being built" page.
export type NavItem = { key: string; label: string; path?: string; owner?: boolean; mgr?: boolean; about: string };
export const NAV: [string, NavItem[]][] = [
  ['Work', [
    { key: 'dash', label: 'Dashboard', path: '/', about: "Today's jobs, who's clocked in, what needs a tech." },
    { key: 'live', label: 'Live map', about: 'Where every tech is while clocked in, and which job they are heading to.' },
    { key: 'dispatch', label: 'Dispatch board', path: '/dispatch', about: 'One row per tech, drag jobs to move them, every 5 minutes.' },
    { key: 'schedule', label: 'Schedule', path: '/schedule', about: 'Day, week and month views of every appointment and visit.' },
    { key: 'jobs', label: 'Jobs', path: '/jobs', about: 'Book jobs, assign techs, add visits, private notes.' },
    { key: 'crew', label: 'Crew', path: '/crew', about: 'Each tech: status, open jobs, closed jobs and tasks.' },
    { key: 'tasks', label: 'Team tasks', about: 'To-dos for anyone on the team, with due dates.' },
    { key: 'timesheets', label: 'Timesheets', path: '/timesheets', mgr: true, about: 'Hours from the clock-in button. Approve or fix with a reason.' },
    { key: 'scorecards', label: 'Tech scorecards', about: 'Revenue, callbacks, reviews and commission per tech.' },
    { key: 'shopinv', label: 'Shop inventory', path: '/shopinv', about: 'Parts in the shop. Truck stock is pulled from here.' },
    { key: 'techinv', label: 'Tech inventory', path: '/techinv', about: 'What is on each truck, low stock, reorders.' },
    { key: 'inbox', label: 'Inbox', path: '/inbox', about: 'Customer texts and team chat in one place.' },
  ]],
  ['Customers', [
    { key: 'customers', label: 'Customers', path: '/customers', about: 'Every customer, their sites, equipment and history.' },
    { key: 'invoices', label: 'Invoices & payments', path: '/invoices', about: 'Every invoice, paid or not, find by customer name. Refunds and fixes.' },
    { key: 'estimates', label: 'Estimates', path: '/estimates', about: 'Sent, approved, pending and declined estimates.' },
    { key: 'financing', label: 'Financing', about: 'Offer monthly payments on big jobs.' },
    { key: 'reviews', label: 'Review requests', about: 'Ask happy customers for a Google review after the job.' },
    { key: 'marketing', label: 'Marketing', about: 'Texts and emails to past customers, with opt-outs.' },
    { key: 'portalset', label: 'Customer portal', about: 'What customers see when they log in.' },
    { key: 'booking', label: 'Online booking', about: 'Customers request appointments from your website.' },
    { key: 'plans', label: 'Maintenance plans', about: 'Members, visits due, and auto-billing.' },
    { key: 'pricebook', label: 'Price book', path: '/pricebook', about: 'Your prices for every task, by customer type.' },
  ]],
  ['Set up', [
    { key: 'allsettings', label: '⚙ All settings', about: 'Every setting in one searchable list.' },
    { key: 'checklists', label: 'Checklists', path: '/checklists', about: 'Steps techs check off. Checkbox, yes/no, write-in or count.' },
    { key: 'sheets', label: 'Count sheets', about: 'Add up estimates by counting vents and units.' },
    { key: 'cats', label: 'Categories & job types', path: '/cats', about: 'Color tags and quick buttons for booking.' },
    { key: 'team', label: 'Team & permissions', path: '/team', mgr: true, about: 'Add people with an invite code, set pay and permissions.' },
    { key: 'supply', label: 'Supply houses', about: 'Your distributors, account numbers and hours.' },
    { key: 'settings', label: 'Alerts & settings', about: 'Automatic texts and notifications.' },
    { key: 'docs', label: 'Documents', about: 'Licenses, insurance and expiry reminders.' },
    { key: 'account', label: 'Account & preferences', about: 'Your company info, logo and look.' },
    { key: 'qb', label: 'QuickBooks', about: 'Send invoices and payments to QuickBooks.' },
  ]],
  ['Owner', [
    { key: 'revenue', label: 'Revenue watch', owner: true, about: 'Money in, this year vs last year.' },
    { key: 'costing', label: 'Job costing', owner: true, about: 'Profit on every job after parts and labor.' },
    { key: 'reports', label: 'Reports', owner: true, about: 'Download your numbers.' },
    { key: 'bank', label: 'Bank & payouts', path: '/billing', owner: true, about: 'Your Cydras plan and connecting your bank for card payments.' },
    { key: 'import', label: 'Switch software', owner: true, about: 'Bring customers over from ServiceTitan or Housecall Pro.' },
  ]],
  ['Help', [
    { key: 'help', label: 'Help & support', about: 'Talk to a person, how-to guides.' },
    { key: 'refer', label: 'Refer a friend', about: 'Give a free month, get a free month.' },
    { key: 'legal', label: 'About & legal', about: 'Terms, privacy and licenses.' },
  ]],
];
export const findNav = (key: string) => NAV.flatMap(([, i]) => i).find((i) => i.key === key);
