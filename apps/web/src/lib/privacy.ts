/** Keep in step with apps/api/src/common/privacy.ts. Bump both together when the notice changes. */
export const PRIVACY_NOTICE_VERSION = '2026-10-12';

export const PRIVACY_NOTICE = [
  {
    title: 'What we collect',
    body: 'Your name, email, employee ID, job details and department (set by your administrator). Your phone number and photo are optional. We keep sign-in records (time, device, IP address), meeting attendance and, when a meeting is recorded, the recording itself.',
  },
  {
    title: 'Why we use it',
    body: 'To run meetings, control who can join them, keep the system secure, and meet our internal and legal obligations.',
  },
  {
    title: 'Who can see it',
    body: 'Your name, email, job title and department are visible to other people in the system. Phone number and employee ID are visible only to administrators and to you. Administrators can see your sign-in history and the activity log.',
  },
  {
    title: 'How long we keep it',
    body: 'Activity logs are kept for up to 365 days and recordings for up to 180 days, after which they are deleted automatically. Your administrator may set different periods. When your account is anonymized, your personal details are removed; meeting history stays under "Former user".',
  },
  {
    title: 'Your rights',
    body: 'You can view and update your profile, download a copy of your data from My profile, and ask your administrator to correct or delete it. Recordings can be watched only by people who joined that meeting, its host and administrators.',
  },
  {
    title: 'Contact',
    body: 'Questions about this notice go to your administrator. This notice is a draft until it has been reviewed by your organisation’s legal or data protection contact.',
  },
];
