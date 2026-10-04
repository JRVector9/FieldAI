import type { Metadata } from "next";
import { FieldOwnerDeletionNotice } from '../../FieldOwnerDeletionNotice';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <><FieldOwnerDeletionNotice />{children}</>;
}
