import { redirect } from 'next/navigation';

/**
 * The forced first-login password flow was replaced by one-time setup links
 * landing on /reset-password. This old route simply forwards there. (File
 * kept only because the build environment cannot delete files.)
 */
export default function ChangePasswordMoved() {
  redirect('/reset-password');
}
