import { ReservationPage } from "../../../field-booking";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReservationPage id={id} />;
}
