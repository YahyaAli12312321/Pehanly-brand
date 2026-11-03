import React from 'react';
import { useApp } from '../context/AppContext';
import Seo from '../seo/Seo';
import { organizationSchema, breadcrumbSchema } from '../seo/schema';

export default function AboutPage() {
  const { navigate } = useApp();

  return (
    <div className="flex flex-col w-full bg-background">
      <Seo title="About Us" description="PEHAN LY is a Karachi-based clothing brand offering retail apparel, wholesale supply, custom manufacturing and printing services." path="/about" jsonLd={[organizationSchema(), breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'About', path: '/about' }])]} />
      {/* 1. HERO — ABOUT PEHAN LY */}
      <section className="relative w-full px-4 sm:px-8 lg:px-12 py-10 lg:py-16 overflow-hidden bg-background">
        <div className="max-w-[1440px] mx-auto">
          {/* Metatag Badges Strip */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 mb-6 border-b border-border-subtle">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted uppercase">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
              <span>ABOUT PEHAN LY</span>
              <span className="text-border-subtle">/</span>
              <span className="text-primary font-bold">ATELIER DIRECTIVE</span>
            </div>
            <div className="text-[11px] font-semibold tracking-widest text-muted uppercase flex items-center gap-2">
              <span>FASHION BRAND</span>
              <span className="text-accent">•</span>
              <span>APPAREL MANUFACTURING</span>
              <span className="text-accent">•</span>
              <span>BESPOKE ATELIER</span>
            </div>
          </div>

          {/* High-End Editorial Split Hero */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
            {/* Editorial Typography Side */}
            <div className="lg:col-span-7 flex flex-col justify-between pr-0 lg:pr-8">
              <div>
                <span className="inline-block px-3 py-1 bg-surface-container text-primary font-mono text-[11px] tracking-widest uppercase mb-4 rounded font-bold">
                  KARACHI • DIRECT CLOTHING FOUNDRY
                </span>
                <h1 className="font-headline text-4xl sm:text-6xl lg:text-7xl text-primary font-extrabold tracking-tight uppercase leading-none mb-6">
                  Wear Your <br />
                  <span className="italic font-normal text-muted">Identity.</span>
                </h1>
                <p className="font-body text-base sm:text-lg text-muted max-w-xl leading-relaxed mb-8">
                  PEHAN LY is a Pakistan-based clothing brand and apparel manufacturing company built around a simple idea: what you wear should represent who you are.
                </p>
              </div>

              {/* Dual Identity Pillars: RTW + Manufacturing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="bg-surface-card p-6 rounded-lg border border-border-subtle shadow-xs">
                  <span className="text-[11px] tracking-widest text-accent uppercase font-black block mb-1">
                    01 / DUAL FACET
                  </span>
                  <h2 className="font-headline text-lg font-bold text-primary mb-1">
                    Ready-to-Wear Brand
                  </h2>
                  <p className="text-xs text-muted leading-relaxed">
                    Contemporary lifestyle silhouettes engineered for effortless daily identity and enduring tactile wear.
                  </p>
                </div>
                <div className="bg-surface-card p-6 rounded-lg border border-border-subtle shadow-xs">
                  <span className="text-[11px] tracking-widest text-primary uppercase font-black block mb-1">
                    02 / DUAL FACET
                  </span>
                  <h2 className="font-headline text-lg font-bold text-primary mb-1">
                    Custom Apparel Foundry
                  </h2>
                  <p className="text-xs text-muted leading-relaxed">
                    Direct cut-and-sew, bespoke finishing, and flexible capacity for emerging labels and enterprise programs.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-4 mt-8 pt-2">
                <a
                  href="#who-we-are"
                  className="inline-flex items-center gap-2 bg-primary text-white px-7 py-3.5 text-xs font-bold uppercase tracking-wider shadow-md hover:bg-primary-light transition-all rounded cursor-pointer"
                >
                  <span>Explore Our Story</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                </a>
                <a
                  href="#one-or-thousands"
                  className="inline-flex items-center gap-2 bg-accent text-primary px-7 py-3.5 text-xs font-bold uppercase tracking-wider shadow-sm hover:bg-accent-light transition-all rounded cursor-pointer"
                >
                  <span>Work With Us</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </a>
              </div>
            </div>

            {/* Visual Lookbook Hero Element */}
            <div className="lg:col-span-5 flex flex-col gap-4 mt-6 lg:mt-0">
              <div className="relative w-full h-[480px] sm:h-[540px] bg-surface-container rounded-xl overflow-hidden shadow-lg group border border-border-subtle">
                <img loading="lazy" decoding="async" referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  alt="Editorial close-up of a model wearing a heavyweight tailored dark forest green hoodie from PEHAN LY"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBd1XbPz2el_cSZ6bi8JsDx3RC4Mk_LV-PqBVKVCt4tPszepSFk4Z1ROZLInrlb6g1jtS7PfjF4IGHZ4vir_-CEBgGkyj9UqlgD0d8NvbM3jpU0x5gQ4k2BQ4KAl-CYUJjJDouLSO7_95Yb4Kwtcq87Vqu8daijyJRQdriGua7GQqVR5JU61ezx2JNrzMc-hF1xtCdV0P7bZ22arKQMCQYKCLONiMlJuWTMz-RoF-S0wpHpD2o7nVcQ"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-transparent to-transparent"></div>
                <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] tracking-widest text-accent uppercase font-bold">
                      RAW IDENTITY SERIES
                    </span>
                    <span className="text-[10px] font-bold tracking-tight text-[#B8C4BE] uppercase">
                      PAKISTAN FABRICATION
                    </span>
                  </div>
                  <p className="font-headline text-lg sm:text-xl font-bold tracking-tight leading-snug">
                    Engineered with purpose. Finished by hand.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between px-2 text-[11px] font-semibold text-muted uppercase tracking-wider">
                <span>KARACHI PRODUCTION DESK</span>
                <span className="text-accent font-bold">IDENTITY THROUGH DETAIL</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. WHO WE ARE */}
      <section className="w-full px-4 sm:px-8 lg:px-12 py-16 bg-surface-card border-y border-border-subtle" id="who-we-are">
        <div className="max-w-[1440px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Visual Tactile Swatch & Studio Atmosphere */}
            <div className="lg:col-span-5 relative">
              <div className="relative w-full h-[460px] sm:h-[520px] rounded-xl bg-surface-container overflow-hidden shadow-md border border-border-subtle">
                <img loading="lazy" decoding="async" referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  alt="A clean artisanal studio view of pure cotton garment fabric bolts and precision pattern cutting"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuABmCRQKnkrsf0LU-FsGWFytAbeW_i36_LOkYn3a_yXMRyW5Ijk2THX1Ll7Z3na97fjeP2wmqe_sRc2UEo_bVbqSsaKx_eFIsZdK2msTNL4t_dYZshx86lpb4bCH_mIFfjHXxj1ROLoKky-vT4OP138We_8R_y2eR3zKA6EZsUPA7sAwlaLNK1LlZuWryyzOzF2wLtfmAg4SYGqTwhHKJ9NM6r1sEFMM39So383-RcVAHXjVOsYQ21b"
                />
                <div className="absolute top-4 left-4 bg-primary text-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded shadow-sm">
                  Direct Foundry Standards
                </div>
              </div>
              {/* Overlapping Mini-Card */}
              <div className="absolute -bottom-6 -right-3 bg-surface p-5 rounded-lg shadow-xl max-w-xs hidden sm:block border border-border-subtle">
                <p className="text-[10px] text-accent uppercase font-black tracking-widest mb-1">OUR FORMULA</p>
                <p className="text-xs text-on-surface leading-relaxed">
                  High-caliber material rigor paired with agile tailoring execution for modern wardrobes.
                </p>
              </div>
            </div>

            {/* Content & 3 Core Pillars */}
            <div className="lg:col-span-7 flex flex-col justify-center pl-0 lg:pl-8 mt-6 lg:mt-0">
              <div className="mb-6">
                <span className="text-xs tracking-widest text-accent font-black uppercase block mb-1">
                  WHO WE ARE
                </span>
                <h2 className="font-headline text-3xl sm:text-4xl font-extrabold text-primary tracking-tight mb-3">
                  Clothing Built Around Identity.
                </h2>
                <p className="font-body text-sm sm:text-base text-muted leading-relaxed mb-6">
                  We create quality apparel for individuals, brands, retailers and businesses — combining contemporary design, reliable production and flexible customization to bring ideas into clothing.
                </p>
              </div>

              {/* 3 Pillars Grid */}
              <div className="grid grid-cols-1 gap-4">
                <div className="bg-surface p-5 rounded-lg border border-border-subtle transition-transform hover:-translate-y-0.5 duration-300">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[20px] text-accent">architecture</span>
                    </div>
                    <div>
                      <h3 className="font-headline text-base font-bold text-primary mb-1">1. Contemporary Design</h3>
                      <p className="text-xs text-muted leading-relaxed">
                        Silhouettes and aesthetics shaped by modern utility and mindful restraint. Designed to be worn repeatedly, keeping fit integrity across everyday life.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-surface p-5 rounded-lg border border-border-subtle transition-transform hover:-translate-y-0.5 duration-300">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[20px] text-accent">precision_manufacturing</span>
                    </div>
                    <div>
                      <h3 className="font-headline text-base font-bold text-primary mb-1">2. Reliable Production</h3>
                      <p className="text-xs text-muted leading-relaxed">
                        Dependable cut-and-sew processes that maintain tight stitch densities, colorfast dyeing, and strict tolerance control from prototype to delivery.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-surface p-5 rounded-lg border border-border-subtle transition-transform hover:-translate-y-0.5 duration-300">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[20px] text-accent">tune</span>
                    </div>
                    <div>
                      <h3 className="font-headline text-base font-bold text-primary mb-1">3. Flexible Customization</h3>
                      <p className="text-xs text-muted leading-relaxed">
                        Scalable bespoke printing, tailored embroidery programs, branded packaging, and private label trims adapted to your specific requirements.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. WHAT WE CREATE (Product Range Lookbook) */}
      <section className="w-full px-4 sm:px-8 lg:px-12 py-16 bg-surface">
        <div className="max-w-[1440px] mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <span className="text-xs tracking-widest text-accent font-black uppercase block mb-1">
                PRODUCT RANGE LOOKBOOK
              </span>
              <h2 className="font-headline text-3xl sm:text-4xl font-extrabold text-primary tracking-tight">
                What We Create
              </h2>
              <p className="text-xs sm:text-sm text-muted max-w-xl mt-1">
                Curated garment categories alongside custom apparel solutions for businesses and organizations.
              </p>
            </div>
            <button
              onClick={() => navigate('shop')}
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-bold text-primary hover:text-accent transition-colors underline underline-offset-8 cursor-pointer"
            >
              <span>Explore PEHAN LY</span>
              <span className="material-symbols-outlined text-[18px]">arrow_outward</span>
            </button>
          </div>

          {/* 6 Strictly Specified Categories */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* 1. T-Shirts */}
            <div className="group bg-surface-card rounded-xl border border-border-subtle overflow-hidden p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="font-headline text-lg font-bold text-primary mb-1.5">T-Shirts</h3>
                <p className="text-xs text-muted leading-relaxed mb-4">
                  Everyday combed singles, relaxed silhouettes, and engineered ribbed collars built to hold shape through countless washes.
                </p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Category 01</span>
                <button
                  onClick={() => navigate('shop')}
                  className="text-xs font-semibold text-primary hover:text-accent cursor-pointer"
                >
                  View Styles →
                </button>
              </div>
            </div>

            {/* 2. Polos */}
            <div className="group bg-surface-card rounded-xl border border-border-subtle overflow-hidden p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="font-headline text-lg font-bold text-primary mb-1.5">Polos</h3>
                <p className="text-xs text-muted leading-relaxed mb-4">
                  Pique knits, tailored collars, and balanced plackets engineered for both high-end corporate identity and casual wear.
                </p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Category 02</span>
                <button
                  onClick={() => navigate('shop')}
                  className="text-xs font-semibold text-primary hover:text-accent cursor-pointer"
                >
                  View Styles →
                </button>
              </div>
            </div>

            {/* 3. Sweatshirts */}
            <div className="group bg-surface-card rounded-xl border border-border-subtle overflow-hidden p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="font-headline text-lg font-bold text-primary mb-1.5">Sweatshirts</h3>
                <p className="text-xs text-muted leading-relaxed mb-4">
                  Comfort fleece, drop-shoulder pullovers, and reinforced double-needle seams for plush comfort and lasting structure.
                </p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Category 03</span>
                <button
                  onClick={() => navigate('shop')}
                  className="text-xs font-semibold text-primary hover:text-accent cursor-pointer"
                >
                  View Styles →
                </button>
              </div>
            </div>

            {/* 4. Hoodies */}
            <div className="group bg-surface-card rounded-xl border border-border-subtle overflow-hidden p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="font-headline text-lg font-bold text-primary mb-1.5">Hoodies</h3>
                <p className="text-xs text-muted leading-relaxed mb-4">
                  Heavyweight architectural hoodies with self-lined hoods, seamless kangaroo pockets, and enduring silhouette volume.
                </p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Category 04</span>
                <button
                  onClick={() => navigate('shop')}
                  className="text-xs font-semibold text-primary hover:text-accent cursor-pointer"
                >
                  View Styles →
                </button>
              </div>
            </div>

            {/* 5. Kidswear */}
            <div className="group bg-surface-card rounded-xl border border-border-subtle overflow-hidden p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="font-headline text-lg font-bold text-primary mb-1.5">Kidswear</h3>
                <p className="text-xs text-muted leading-relaxed mb-4">
                  Comfortable, durable everyday clothing tailored specifically for gentle skin feel, flexible stretch, and daily wearability.
                </p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Category 05</span>
                <button
                  onClick={() => navigate('shop')}
                  className="text-xs font-semibold text-primary hover:text-accent cursor-pointer"
                >
                  View Styles →
                </button>
              </div>
            </div>

            {/* 6. Custom Apparel Solutions */}
            <div className="group bg-primary text-white rounded-xl overflow-hidden p-6 shadow-md flex flex-col justify-between border border-primary-dark">
              <div>
                <h3 className="font-headline text-lg font-bold text-white mb-1.5">Custom Apparel Solutions</h3>
                <p className="text-xs text-[#B8C4BE] leading-relaxed mb-4">
                  Dedicated turnkey production programs crafted specifically for businesses, institutional teams, and commercial organizations.
                </p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-primary-light/40">
                <span className="text-[10px] font-bold uppercase tracking-widest text-accent">Category 06</span>
                <button
                  onClick={() => navigate('custom-manufacturing')}
                  className="text-xs font-semibold text-accent hover:underline cursor-pointer"
                >
                  Inquire Now →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. BEYOND READY-TO-WEAR (B2B Manufacturing Transition) */}
      <section className="w-full px-4 sm:px-8 lg:px-12 py-16 bg-surface-container border-y border-border-subtle">
        <div className="max-w-[1440px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-12">
            <div className="lg:col-span-5">
              <span className="text-xs tracking-widest text-accent font-black uppercase block mb-1">
                BEYOND READY-TO-WEAR
              </span>
              <h2 className="font-headline text-3xl sm:text-4xl font-extrabold text-primary tracking-tight">
                From Clothing to Complete Apparel Solutions.
              </h2>
            </div>
            <div className="lg:col-span-7">
              <p className="text-sm sm:text-base text-on-surface leading-relaxed">
                Whether you are building your own clothing line, sourcing for a retail business or looking for bulk apparel, we work to provide a practical solution from concept to finished product.
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-6">
                <button
                  onClick={() => navigate('custom-manufacturing')}
                  className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 text-xs uppercase font-bold tracking-wider hover:bg-primary-light transition-all rounded shadow-sm cursor-pointer"
                >
                  <span>Explore Custom Manufacturing</span>
                  <span className="material-symbols-outlined text-[18px]">tune</span>
                </button>
                <button
                  onClick={() => navigate('printing-branding')}
                  className="inline-flex items-center gap-2 bg-surface-card border border-border-subtle text-primary px-5 py-2.5 text-xs uppercase font-bold tracking-wider hover:bg-surface transition-all rounded shadow-sm cursor-pointer"
                >
                  <span>Explore Printing & Branding</span>
                  <span className="material-symbols-outlined text-[18px]">draw</span>
                </button>
              </div>
            </div>
          </div>

          {/* 8 Capabilities Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface-card p-5 rounded-lg flex flex-col justify-between shadow-xs border border-border-subtle">
              <span className="material-symbols-outlined text-3xl text-primary mb-3">cut</span>
              <div>
                <h3 className="font-headline text-sm font-bold text-primary mb-1">Custom Manufacturing</h3>
                <p className="text-xs text-muted">Bespoke pattern drafting, precision cutting, and assembly matching your exact spec sheet.</p>
              </div>
            </div>
            <div className="bg-surface-card p-5 rounded-lg flex flex-col justify-between shadow-xs border border-border-subtle">
              <span className="material-symbols-outlined text-3xl text-primary mb-3">branding_watermark</span>
              <div>
                <h3 className="font-headline text-sm font-bold text-primary mb-1">Private-Label Solutions</h3>
                <p className="text-xs text-muted">Turnkey brand development, transforming foundational silhouettes into your proprietary label.</p>
              </div>
            </div>
            <div className="bg-surface-card p-5 rounded-lg flex flex-col justify-between shadow-xs border border-border-subtle">
              <span className="material-symbols-outlined text-3xl text-primary mb-3">texture</span>
              <div>
                <h3 className="font-headline text-sm font-bold text-primary mb-1">Fabric & Garment Development</h3>
                <p className="text-xs text-muted">Direct yarn sourcing, customized GSM weights, specialized knits, and hand-feel finishes.</p>
              </div>
            </div>
            <div className="bg-surface-card p-5 rounded-lg flex flex-col justify-between shadow-xs border border-border-subtle">
              <span className="material-symbols-outlined text-3xl text-primary mb-3">format_paint</span>
              <div>
                <h3 className="font-headline text-sm font-bold text-primary mb-1">Custom Printing</h3>
                <p className="text-xs text-muted">Automated direct-to-film (DTF), plastisol, high-density screen printing, and discharge inks.</p>
              </div>
            </div>
            <div className="bg-surface-card p-5 rounded-lg flex flex-col justify-between shadow-xs border border-border-subtle">
              <span className="material-symbols-outlined text-3xl text-primary mb-3">design_services</span>
              <div>
                <h3 className="font-headline text-sm font-bold text-primary mb-1">Embroidery</h3>
                <p className="text-xs text-muted">High-density 3D puff embroidery, refined flat crest stitching, and colorfast thread programs.</p>
              </div>
            </div>
            <div className="bg-surface-card p-5 rounded-lg flex flex-col justify-between shadow-xs border border-border-subtle">
              <span className="material-symbols-outlined text-3xl text-primary mb-3">sell</span>
              <div>
                <h3 className="font-headline text-sm font-bold text-primary mb-1">Labels</h3>
                <p className="text-xs text-muted">Woven damask labels, printed neck tags, heat-transfer neck specs, and care instruction sets.</p>
              </div>
            </div>
            <div className="bg-surface-card p-5 rounded-lg flex flex-col justify-between shadow-xs border border-border-subtle">
              <span className="material-symbols-outlined text-3xl text-primary mb-3">loyalty</span>
              <div>
                <h3 className="font-headline text-sm font-bold text-primary mb-1">Tags</h3>
                <p className="text-xs text-muted">FSC-certified hangtags, embossed cardstock, matte black safety pins, and serialized seals.</p>
              </div>
            </div>
            <div className="bg-surface-card p-5 rounded-lg flex flex-col justify-between shadow-xs border border-border-subtle">
              <span className="material-symbols-outlined text-3xl text-primary mb-3">inventory_2</span>
              <div>
                <h3 className="font-headline text-sm font-bold text-primary mb-1">Packaging</h3>
                <p className="text-xs text-muted">Custom frosted zip-lock polybags, branded shipper cartons, and barcoded inventory packaging.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. BUILT FOR PEOPLE. MADE FOR BRANDS. (Detail Storytelling) */}
      <section className="w-full px-4 sm:px-8 lg:px-12 py-16 bg-surface">
        <div className="max-w-[1440px] mx-auto">
          <div className="max-w-2xl mb-12">
            <span className="text-xs tracking-widest text-accent font-black uppercase block mb-1">
              OBSESSION WITH THE CRAFT
            </span>
            <h2 className="font-headline text-3xl sm:text-4xl font-extrabold text-primary tracking-tight mb-2">
              Built for People. Made for Brands.
            </h2>
            <p className="font-headline text-base sm:text-lg text-muted italic mb-3">
              We believe good clothing starts with the details.
            </p>
            <p className="text-xs sm:text-sm text-on-surface leading-relaxed">
              From the feel of the fabric and quality of stitching to the fit, finishing and final presentation, every part of the product matters. Our focus is on creating garments that are comfortable to wear, consistent in quality and ready to represent your identity.
            </p>
          </div>

          {/* 5 Facets Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-surface-card p-4 rounded-xl border border-border-subtle shadow-xs flex flex-col justify-between">
              <div className="h-44 w-full bg-surface-container rounded-lg overflow-hidden mb-3 border border-border-subtle">
                <img loading="lazy" decoding="async" referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  alt="Natural combed cotton jersey fibers"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuALBgLY09Vg-LtjslSccN0qbyxJJg2R1KFekx0jc51_U6fYvLGr2VtOd4OPxNsEZuC-K3bSIqNo1Q1-SQ6vPrCHxEVcpcxjUEGnhazHyYwlV3-_EjGfg-sxYuPfbxpkjJEKquhV6-9MOFLI1yASngNZyCxaKJ2I1z7i3V0L4M73JYL8IxQ9t8UTlBIPAP6UMfE3pMKA5h0lAdJY1joh7TWYwPjBcFNqgr_o1WE_NwHp7DvMl-1IBpUL"
                />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-widest text-accent font-black block mb-0.5">01 / TACTILE</span>
                <h3 className="font-headline text-sm font-bold text-primary mb-1">Fabric</h3>
                <p className="text-xs text-muted leading-relaxed">Carefully evaluated for hand-feel, thread density, natural drape, and resilience across wear.</p>
              </div>
            </div>

            <div className="bg-surface-card p-4 rounded-xl border border-border-subtle shadow-xs flex flex-col justify-between">
              <div className="h-44 w-full bg-surface-container rounded-lg overflow-hidden mb-3 border border-border-subtle">
                <img loading="lazy" decoding="async" referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  alt="Macro view of precision industrial needlework"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDNGyb_BVYRX6dNcHDvOdNCgDl4exMUS--4spsdCDMbjH7n_KSDcr-T149gTj2h4QiyHFEllLIuzzTws1s8o37kKBfTF76yOejLkp0kc8WabjJIfGr12GbTG0Efw6doUwPXNL3viCTqE4fSJaXivbI4GrEHLnhhtX_Y6lehRVM8GUeOmi7GlCVyGnCfMsv3-JFfCbvDTG01QekmCpI731RV4KvSL9j1CvxX1ZwCNq93WX7ZeXPlNrhj"
                />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-widest text-accent font-black block mb-0.5">02 / STRUCTURE</span>
                <h3 className="font-headline text-sm font-bold text-primary mb-1">Stitching</h3>
                <p className="text-xs text-muted leading-relaxed">Rigorous needlework, clean seam tolerances, and reinforced joins engineered against distortion.</p>
              </div>
            </div>

            <div className="bg-surface-card p-4 rounded-xl border border-border-subtle shadow-xs flex flex-col justify-between">
              <div className="h-44 w-full bg-surface-container rounded-lg overflow-hidden mb-3 border border-border-subtle">
                <img loading="lazy" decoding="async" referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  alt="Editorial mannequin showing precise shoulder drop"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCN7G5O55AshmujqcDed_3hcV3M-TPjY7bnuRZxNUY37X7MgDnuA0jP_siqdxvJJIm4yYpzDF-aW3WTRouAn9kjNJJm-Sxm8Wva30vp6C0RhnN2dVM4MVKcXju_zZOk41uJZ0-7J3i5F4_tnYOs-uuz4mkbkB93Iz9huSr82SapwpWmoyHP24ssSJS-vt85xBZ8_rVe6n0S914XD4_sHO_PAwo3gB49kcOzonEwVml_zXLB3T2VbEvo"
                />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-widest text-accent font-black block mb-0.5">03 / GEOMETRY</span>
                <h3 className="font-headline text-sm font-bold text-primary mb-1">Fit</h3>
                <p className="text-xs text-muted leading-relaxed">Balanced proportions that complement natural movement, maintaining structure effortlessly.</p>
              </div>
            </div>

            <div className="bg-surface-card p-4 rounded-xl border border-border-subtle shadow-xs flex flex-col justify-between">
              <div className="h-44 w-full bg-surface-container rounded-lg overflow-hidden mb-3 border border-border-subtle">
                <img loading="lazy" decoding="async" referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  alt="Artisanal pressing studio detail showing steam iron"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDMu6egF-GZW91QlzDPTZCAgSwLoVj4IZggcLNYG7HVTI4ED-zFQxktlMSTcDEbfDMzM5ovYZEMBDI0Fp0ENJaNSzoSNcC6IY-gtokYFY7y9oD2p_yV-LulpFiCq8ugVjnQWO3lGRwHUGgrBJRyB7FJVkSAeAkT7lWF7uXGr-Aq6tHtYjt_0JHWzhEqhbNGts5cJ27ZG5D93WGxeTA-_XlgCcBCQS3yrwuW2LAnnAfGXy1s6pCChIOD"
                />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-widest text-accent font-black block mb-0.5">04 / CALIBER</span>
                <h3 className="font-headline text-sm font-bold text-primary mb-1">Finishing</h3>
                <p className="text-xs text-muted leading-relaxed">Professional steam forming, pre-shrunk conditioning, and thread-clean inspections.</p>
              </div>
            </div>

            <div className="bg-surface-card p-4 rounded-xl border border-border-subtle shadow-xs flex flex-col justify-between">
              <div className="h-44 w-full bg-surface-container rounded-lg overflow-hidden mb-3 border border-border-subtle">
                <img loading="lazy" decoding="async" referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  alt="Packaging presentation of a folded garment in branded recycled poly packaging"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBxsgAeBthXjWUnM4z38JlGJiCsTCahnrfgFyNhZJZyVpXqszlCYpsOoWiT0HbNmEO_fGGeRkBc7D1knxfeWXNpunv5sN6gbnqwc2ZTSXkwcMY-EuTqCgMwZFLZtjy5ZzLm_gw6LSLmqgSzHbCssSfG2zbBj-rQTWZDCsndkU-EBkk6NpH58V4AVW5pvbbq9gC7b2K_C63B4iBhdY9aTekaqOdr-UoFFhcdizt7ZVtVmzolcReelUEP"
                />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-widest text-accent font-black block mb-0.5">05 / DELIVERY</span>
                <h3 className="font-headline text-sm font-bold text-primary mb-1">Final Presentation</h3>
                <p className="text-xs text-muted leading-relaxed">Refined boxing, labeling, and protective containment ready immediately for retail shelves.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. WHO PEHAN LY IS BUILT FOR (Audience) */}
      <section className="w-full px-4 sm:px-8 lg:px-12 py-16 bg-surface-card border-y border-border-subtle">
        <div className="max-w-[1440px] mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs tracking-widest text-accent font-black uppercase block mb-1">
              VERSATILE COLLABORATION
            </span>
            <h2 className="font-headline text-3xl sm:text-4xl font-extrabold text-primary tracking-tight">
              Made for Individuals. Built for Businesses.
            </h2>
            <p className="text-xs sm:text-sm text-muted mt-2">
              A dual-focused infrastructure crafted to deliver singular garments with atelier care, or thousands with rigorous manufacturing fidelity.
            </p>
          </div>

          {/* Exact 6 Audiences */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-surface p-6 rounded-xl border border-border-subtle shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold text-accent tracking-widest uppercase">AUDIENCE 01</span>
                <span className="material-symbols-outlined text-2xl text-primary">person</span>
              </div>
              <h3 className="font-headline text-base font-bold text-primary mb-1">Individuals</h3>
              <p className="text-xs text-muted leading-relaxed">
                Looking for quality ready-to-wear clothing that feels authentic, comfortable, and distinctly personal for daily self-expression.
              </p>
            </div>

            <div className="bg-surface p-6 rounded-xl border border-border-subtle shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold text-accent tracking-widest uppercase">AUDIENCE 02</span>
                <span className="material-symbols-outlined text-2xl text-primary">auto_awesome</span>
              </div>
              <h3 className="font-headline text-base font-bold text-primary mb-1">Brands</h3>
              <p className="text-xs text-muted leading-relaxed">
                Developing bespoke fashion collections that require custom fit prototyping, tailored dye shades, and dedicated cut-and-sew pipelines.
              </p>
            </div>

            <div className="bg-surface p-6 rounded-xl border border-border-subtle shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold text-accent tracking-widest uppercase">AUDIENCE 03</span>
                <span className="material-symbols-outlined text-2xl text-primary">storefront</span>
              </div>
              <h3 className="font-headline text-base font-bold text-primary mb-1">Retailers</h3>
              <p className="text-xs text-muted leading-relaxed">
                Curating quality merchandise for their physical stores and e-commerce storefronts with consistent seasonal re-order stability.
              </p>
            </div>

            <div className="bg-surface p-6 rounded-xl border border-border-subtle shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold text-accent tracking-widest uppercase">AUDIENCE 04</span>
                <span className="material-symbols-outlined text-2xl text-primary">corporate_fare</span>
              </div>
              <h3 className="font-headline text-base font-bold text-primary mb-1">Businesses & Organizations</h3>
              <p className="text-xs text-muted leading-relaxed">
                Seeking custom uniforms, corporate merchandise, and branded staff apparel that reflect company prestige with long-lasting comfort.
              </p>
            </div>

            <div className="bg-surface p-6 rounded-xl border border-border-subtle shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold text-accent tracking-widest uppercase">AUDIENCE 05</span>
                <span className="material-symbols-outlined text-2xl text-primary">local_shipping</span>
              </div>
              <h3 className="font-headline text-base font-bold text-primary mb-1">Wholesalers</h3>
              <p className="text-xs text-muted leading-relaxed">
                Coordinating bulk apparel orders and multi-market distribution with reliable logistics pipelines and standardized volume pricing.
              </p>
            </div>

            <div className="bg-surface p-6 rounded-xl border border-border-subtle shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold text-accent tracking-widest uppercase">AUDIENCE 06</span>
                <span className="material-symbols-outlined text-2xl text-primary">rocket_launch</span>
              </div>
              <h3 className="font-headline text-base font-bold text-primary mb-1">Emerging Brands</h3>
              <p className="text-xs text-muted leading-relaxed">
                Taking their very first collections from concept to reality, supported by guidance on patterns, sampling, and minimum quantities.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. FROM PAKISTAN TO THE WORLD (Origins & Reach) */}
      <section className="w-full px-4 sm:px-8 lg:px-12 py-16 bg-primary text-white">
        <div className="max-w-[1440px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6">
              <div className="flex items-center gap-1.5 text-accent text-xs tracking-widest uppercase mb-2 font-bold">
                <span className="material-symbols-outlined text-[18px]">location_on</span>
                <span>OUR HOME & VISION</span>
              </div>
              <h2 className="font-headline text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-2">
                Based in Pakistan. Built for What’s Next.
              </h2>
              <div className="inline-block bg-primary-light px-3 py-1 text-[11px] font-bold text-accent uppercase tracking-wider mb-4 rounded">
                BASE: KARACHI, PAKISTAN
              </div>
              <p className="text-sm text-[#B8C4BE] leading-relaxed mb-6 font-light">
                Based in Karachi, Pakistan, PEHAN LY currently focuses on serving the local market with quality apparel, customization and manufacturing solutions. As the brand grows, our vision is to build connections with international buyers, wholesalers, retailers and emerging brands.
              </p>
              <div className="p-4 bg-primary-dark/80 rounded-lg border border-white/10">
                <p className="text-xs sm:text-sm text-white leading-relaxed italic">
                  "Our goal is not simply to sell garments. It is to build long-term relationships based on quality, communication and reliability."
                </p>
              </div>
            </div>

            {/* Growth Roadmap Diagram */}
            <div className="lg:col-span-6">
              <div className="p-6 bg-primary-light/60 rounded-xl border border-white/10 relative overflow-hidden shadow-xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
                  <div>
                    <span className="text-[10px] text-accent tracking-widest uppercase font-bold block">OUR HOME</span>
                    <span className="font-headline text-lg font-bold text-white">Karachi, Pakistan</span>
                  </div>
                  <span className="material-symbols-outlined text-3xl text-accent">hub</span>
                </div>
                <p className="text-xs text-[#B8C4BE] mb-6 leading-relaxed">
                  PEHAN LY is based in Karachi and currently focused on serving the Pakistan market while building toward future international connections.
                </p>

                {/* Growth Roadmap Graphic */}
                <div className="w-full bg-primary-dark/60 p-4 rounded-lg flex flex-col gap-3">
                  <div className="flex items-start gap-3 p-3 rounded bg-primary-light/80 border border-white/5">
                    <div className="w-7 h-7 rounded-full bg-accent text-primary flex items-center justify-center font-bold text-xs shrink-0">
                      01
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-accent uppercase tracking-wider font-bold">KARACHI, PAKISTAN</span>
                        <span className="text-[10px] text-[#B8C4BE] uppercase">FOUNDING BASE</span>
                      </div>
                      <p className="text-[11px] text-[#B8C4BE] mt-0.5">Direct foundry headquarters, creative studio, and production operations.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded bg-primary-light border border-accent/40 shadow-sm">
                    <div className="w-7 h-7 rounded-full bg-accent text-primary flex items-center justify-center font-bold text-xs shrink-0">
                      02
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-accent uppercase tracking-wider font-bold">LOCAL MARKET — TODAY</span>
                        <span className="text-[9px] bg-accent text-primary px-1.5 py-0.5 rounded font-black uppercase">ACTIVE FOCUS</span>
                      </div>
                      <p className="text-[11px] text-white mt-0.5">Serving individuals, brands, and businesses across Pakistan with dedicated manufacturing and ready-to-wear.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded bg-primary-dark/40 border border-dashed border-white/20">
                    <div className="w-7 h-7 rounded-full bg-primary text-accent flex items-center justify-center font-bold text-xs shrink-0 border border-accent/40">
                      03
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#B8C4BE] uppercase tracking-wider font-bold">INTERNATIONAL CONNECTIONS</span>
                        <span className="text-[10px] text-accent uppercase font-bold">FUTURE HORIZON</span>
                      </div>
                      <p className="text-[11px] text-[#B8C4BE] mt-0.5">Building strategic global partnerships with international buyers, retailers, and emerging labels.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. WHAT MATTERS TO US (Core Values) */}
      <section className="w-full px-4 sm:px-8 lg:px-12 py-16 bg-surface">
        <div className="max-w-[1440px] mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs tracking-widest text-accent font-black uppercase block mb-1">
              ETHOS & PRINCIPLES
            </span>
            <h2 className="font-headline text-3xl sm:text-4xl font-extrabold text-primary tracking-tight mb-3">
              What Matters to Us
            </h2>
            <div className="p-3 bg-surface-container rounded-lg inline-block border border-border-subtle shadow-xs">
              <p className="text-xs sm:text-sm text-primary font-medium italic">
                “Our goal is not simply to sell garments. It is to build long-term relationships based on quality, communication and reliability.”
              </p>
            </div>
          </div>

          {/* 4 Values */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-surface-card p-6 rounded-xl border border-border-subtle shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-accent font-black tracking-widest uppercase block mb-2">VALUE 01</span>
                <div className="w-10 h-10 rounded bg-primary text-white flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-[20px] text-accent">verified</span>
                </div>
                <h3 className="font-headline text-base font-bold text-primary mb-1">Quality</h3>
                <p className="text-xs text-muted leading-relaxed">
                  In fabric selection, stitch integrity, pattern drape, and colorfast performance across every batch produced.
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-border-subtle text-[10px] font-bold text-muted uppercase tracking-wider">
                ZERO COMPROMISE
              </div>
            </div>

            <div className="bg-surface-card p-6 rounded-xl border border-border-subtle shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-accent font-black tracking-widest uppercase block mb-2">VALUE 02</span>
                <div className="w-10 h-10 rounded bg-primary text-white flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-[20px] text-accent">forum</span>
                </div>
                <h3 className="font-headline text-base font-bold text-primary mb-1">Communication</h3>
                <p className="text-xs text-muted leading-relaxed">
                  Clear, transparent, and responsive updates from the first sample sketch to final logistics tracking.
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-border-subtle text-[10px] font-bold text-muted uppercase tracking-wider">
                DIRECT COLLABORATION
              </div>
            </div>

            <div className="bg-surface-card p-6 rounded-xl border border-border-subtle shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-accent font-black tracking-widest uppercase block mb-2">VALUE 03</span>
                <div className="w-10 h-10 rounded bg-primary text-white flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-[20px] text-accent">task_alt</span>
                </div>
                <h3 className="font-headline text-base font-bold text-primary mb-1">Reliability</h3>
                <p className="text-xs text-muted leading-relaxed">
                  Consistent production schedules, predictable output quality, and dependable manufacturing delivery windows.
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-border-subtle text-[10px] font-bold text-muted uppercase tracking-wider">
                CONSISTENT EXECUTION
              </div>
            </div>

            <div className="bg-surface-card p-6 rounded-xl border border-border-subtle shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-accent font-black tracking-widest uppercase block mb-2">VALUE 04</span>
                <div className="w-10 h-10 rounded bg-primary text-white flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-[20px] text-accent">handshake</span>
                </div>
                <h3 className="font-headline text-base font-bold text-primary mb-1">Long-Term Relationships</h3>
                <p className="text-xs text-muted leading-relaxed">
                  True manufacturing and apparel partnerships that scale, evolve, and grow alongside your brand identity over time.
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-border-subtle text-[10px] font-bold text-muted uppercase tracking-wider">
                SCALED PARTNERSHIP
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 9. FROM IDEA TO PRODUCT (The Pipeline) */}
      <section className="w-full px-4 sm:px-8 lg:px-12 py-16 bg-surface-container border-y border-border-subtle">
        <div className="max-w-[1440px] mx-auto">
          <div className="max-w-2xl mb-12">
            <span className="text-xs tracking-widest text-accent font-black uppercase block mb-1">
              THE ATELIER PIPELINE
            </span>
            <h2 className="font-headline text-3xl sm:text-4xl font-extrabold text-primary tracking-tight">
              From an Idea to a Product You Can Be Proud Of.
            </h2>
            <p className="text-xs sm:text-sm text-muted mt-1">
              A step-by-step workflow structured strictly around client capabilities, transparent checkpoints, and direct communication.
            </p>
          </div>

          {/* 6 Sequential Steps */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-surface-card p-6 rounded-xl border border-border-subtle flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-headline text-3xl font-black text-muted/30">01</span>
                  <span className="material-symbols-outlined text-2xl text-accent">lightbulb</span>
                </div>
                <h3 className="font-headline text-base font-bold text-primary mb-1">Your Idea</h3>
                <p className="text-xs text-muted leading-relaxed">
                  Initial inspiration, sketches, tech packs, or functional requirements submitted for design review and feasibility analysis.
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-border-subtle text-[10px] font-bold text-muted uppercase tracking-wider">
                STEP ONE • CONCEPT
              </div>
            </div>

            <div className="bg-surface-card p-6 rounded-xl border border-border-subtle flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-headline text-3xl font-black text-muted/30">02</span>
                  <span className="material-symbols-outlined text-2xl text-accent">straighten</span>
                </div>
                <h3 className="font-headline text-base font-bold text-primary mb-1">Garment Development</h3>
                <p className="text-xs text-muted leading-relaxed">
                  Silhouette drafting, custom sizing grading, fabric blend testing, and sample prototyping for tactile approval.
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-border-subtle text-[10px] font-bold text-muted uppercase tracking-wider">
                STEP TWO • SAMPLING
              </div>
            </div>

            <div className="bg-surface-card p-6 rounded-xl border border-border-subtle flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-headline text-3xl font-black text-muted/30">03</span>
                  <span className="material-symbols-outlined text-2xl text-accent">palette</span>
                </div>
                <h3 className="font-headline text-base font-bold text-primary mb-1">Customization</h3>
                <p className="text-xs text-muted leading-relaxed">
                  Precision screen printing, DTF transfers, dense embroidery digitization, and exacting Pantone shade matching.
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-border-subtle text-[10px] font-bold text-muted uppercase tracking-wider">
                STEP THREE • ARTWORK
              </div>
            </div>

            <div className="bg-surface-card p-6 rounded-xl border border-border-subtle flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-headline text-3xl font-black text-muted/30">04</span>
                  <span className="material-symbols-outlined text-2xl text-accent">factory</span>
                </div>
                <h3 className="font-headline text-base font-bold text-primary mb-1">Production</h3>
                <p className="text-xs text-muted leading-relaxed">
                  Industrial cut, seam stitching, quality verification check-points, and uniform assembly run under strict guidelines.
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-border-subtle text-[10px] font-bold text-muted uppercase tracking-wider">
                STEP FOUR • RUNNING
              </div>
            </div>

            <div className="bg-surface-card p-6 rounded-xl border border-border-subtle flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-headline text-3xl font-black text-muted/30">05</span>
                  <span className="material-symbols-outlined text-2xl text-accent">checkroom</span>
                </div>
                <h3 className="font-headline text-base font-bold text-primary mb-1">Finishing & Presentation</h3>
                <p className="text-xs text-muted leading-relaxed">
                  Custom woven neck labels, hangtags, thread clipping, steam finishing, and individual branded packaging.
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-border-subtle text-[10px] font-bold text-muted uppercase tracking-wider">
                STEP FIVE • BRANDING
              </div>
            </div>

            <div className="bg-primary text-white p-6 rounded-xl border border-primary-dark flex flex-col justify-between shadow-sm">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-headline text-3xl font-black text-accent">06</span>
                  <span className="material-symbols-outlined text-2xl text-accent">inventory</span>
                </div>
                <h3 className="font-headline text-base font-bold text-white mb-1">Finished Product</h3>
                <p className="text-xs text-[#B8C4BE] leading-relaxed">
                  Final quality clearance, master carton sorting, and secure dispatch ready to wear or sell immediately.
                </p>
              </div>
              <div className="pt-4 mt-4 border-t border-primary-light/40 text-[10px] font-bold text-accent uppercase tracking-wider">
                STEP SIX • DISPATCH
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 10. ONE PRODUCT OR THOUSANDS (Scale Comparison) */}
      <section className="w-full px-4 sm:px-8 lg:px-12 py-16 bg-surface" id="one-or-thousands">
        <div className="max-w-[1440px] mx-auto">
          {/* High Impact Quote Callout */}
          <div className="p-8 sm:p-12 bg-surface-card rounded-2xl border border-border-subtle shadow-md mb-12">
            <span className="text-xs text-accent tracking-widest uppercase font-black block mb-3">
              FLEXIBILITY IN SCALE
            </span>
            <blockquote className="font-headline text-2xl sm:text-4xl text-primary font-bold tracking-tight leading-tight max-w-4xl">
              “Whether you are looking for one product for yourself or developing thousands of pieces for your brand, PEHAN LY is built to help you move from an idea to a product you can be proud of.”
            </blockquote>
          </div>

          {/* Editorial Split Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* The Individual */}
            <div className="bg-surface-card p-8 rounded-xl border border-border-subtle flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-primary tracking-widest uppercase">THE SINGLE GARMENT</span>
                  <span className="material-symbols-outlined text-3xl text-primary">person_outline</span>
                </div>
                <h3 className="font-headline text-2xl font-bold text-primary mb-3">Individual Quality</h3>
                <p className="text-sm text-muted leading-relaxed mb-6">
                  Engineered for the person who values how clothing touches their skin. Every single tee, hoodie, and sweatshirt from our ready-to-wear drops embodies intentional cut, clean lines, and durable comfort.
                </p>
                <ul className="flex flex-col gap-3 text-xs text-on-surface">
                  <li className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-accent text-[18px]">check_circle</span>
                    <span>Direct customer orders & curated ready-to-wear drops</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-accent text-[18px]">check_circle</span>
                    <span>Zero compromise on single-piece fabric and stitching standards</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-accent text-[18px]">check_circle</span>
                    <span>Immediate delivery from our local warehouse inventory</span>
                  </li>
                </ul>
              </div>
              <div className="pt-6 mt-6 border-t border-border-subtle">
                <button
                  onClick={() => navigate('shop')}
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary hover:text-accent transition-colors cursor-pointer"
                >
                  <span>Explore Ready-to-Wear Catalog</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            </div>

            {/* The Brand & Enterprise */}
            <div className="bg-primary text-white p-8 rounded-xl border border-primary-dark flex flex-col justify-between shadow-md">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-accent tracking-widest uppercase">THE INDUSTRIAL VOLUME</span>
                  <span className="material-symbols-outlined text-3xl text-accent">domain</span>
                </div>
                <h3 className="font-headline text-2xl font-bold text-white mb-3">Thousands Scaled with Care</h3>
                <p className="text-sm text-[#B8C4BE] leading-relaxed mb-6">
                  Built to manage the rigorous demands of enterprise uniforms, boutique label lines, and nationwide retail merchandise. Reliable production runs where sample piece 01 matches piece 10,000.
                </p>
                <ul className="flex flex-col gap-3 text-xs text-white">
                  <li className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-accent text-[18px]">check_circle</span>
                    <span>Flexible minimum order quantities customized to project scale</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-accent text-[18px]">check_circle</span>
                    <span>Custom fabric development, dyeing, and full branding suite</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-accent text-[18px]">check_circle</span>
                    <span>Dedicated account oversight and sample approvals</span>
                  </li>
                </ul>
              </div>
              <div className="pt-6 mt-6 border-t border-primary-light/40">
                <button
                  onClick={() => navigate('wholesale')}
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent hover:underline transition-colors cursor-pointer"
                >
                  <span>Initiate Manufacturing Inquiry</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
