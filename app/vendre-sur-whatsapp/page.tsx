import { LandingPage, landingMetadata } from "@/components/site/landing-page";
import { getLanding } from "@/lib/landings";

const SLUG = "vendre-sur-whatsapp";

export const metadata = landingMetadata(SLUG);

export default function Page() {
  return <LandingPage landing={getLanding(SLUG)} />;
}
