import { Navbar } from "@/components/site/navbar";
import { Hero } from "@/components/site/hero";
import { HowItWorks } from "@/components/site/how-it-works";
import { AppPreview } from "@/components/site/app-preview";
import { Pricing } from "@/components/site/pricing";
import { DashboardPreview } from "@/components/site/dashboard-preview";
import { Testimonials } from "@/components/site/testimonials";
import { FinalCta } from "@/components/site/final-cta";
import { Footer } from "@/components/site/footer";

export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero />
      <div className="border-y border-border py-8">
        <div className="container flex flex-wrap justify-center gap-10 text-xs font-semibold tracking-wide text-muted-foreground">
          <span>FACEBOOK</span><span>INSTAGRAM</span><span>TIKTOK</span>
          <span>WHATSAPP</span><span>WAVE</span><span>ORANGE MONEY</span>
        </div>
      </div>
      <HowItWorks />
      <AppPreview />
      <Pricing />
      <DashboardPreview />
      <Testimonials />
      <FinalCta />
      <Footer />
    </main>
  );
}
