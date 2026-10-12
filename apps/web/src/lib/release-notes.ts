import pkg from '../../package.json';

/** The version shown in the "What's new" dialog is the web package version, so the two cannot drift apart. */
export const APP_VERSION: string = pkg.version;

export interface ReleaseNotes {
  version: string;
  date: string;
  sections: { title: string; items: string[] }[];
}

/** Update this with every release that users should hear about. The dialog opens once per version per browser. */
export const RELEASE_NOTES: ReleaseNotes = {
  version: '0.1.1',
  date: '2026-10-12',
  sections: [
    {
      title: 'For everyone',
      items: [
        'My profile: edit your display name and phone, and upload a photo (shown in the sidebar, People and meetings).',
        'Change your password and see the devices you are signed in on. You can sign out any of them.',
        'People: find colleagues by name, email or department.',
        'New or reset accounts must choose their own password at first sign-in.',
      ],
    },
    {
      title: 'For administrators',
      items: [
        'Users: search, filter and export the list, edit profiles, and import many users from a CSV file.',
        'Offboarding: suspend an account now or on the last working day. Rooms and recordings are handed over to someone you choose.',
        'Reactivate a suspended account, or anonymize it to remove personal data (this cannot be undone).',
        'Departments: manage the department list used on profiles.',
      ],
    },
    {
      title: 'Safer by default',
      items: [
        'The system always keeps at least one active administrator.',
        'Revoked sessions stay signed out, and photo and CSV uploads have size limits.',
      ],
    },
  ],
};
