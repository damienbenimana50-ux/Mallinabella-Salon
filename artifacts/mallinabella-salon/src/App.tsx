import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  getGetAvailabilityQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetMyBookingsQueryKey,
  getListBookingsQueryKey,
  getListCampaignsQueryKey,
  getListClientsQueryKey,
  getListServicesQueryKey,
  useCreateBooking,
  useCreateCampaign,
  useCreateService,
  useDeleteService,
  useGetAvailability,
  useGetDashboardSummary,
  useGetMyBookings,
  useListBookings,
  useListCampaigns,
  useListClients,
  useListServices,
  useListStylists,
  useSendCampaign,
  useUpdateBooking,
  useUpdateService,
} from '@workspace/api-client-react';
import type { Booking, Service, ServiceInput } from '@workspace/api-client-react';
import {
  ArrowDown, ArrowLeft, ArrowRight, CalendarDays, Check,
  Clock3, Flower2, Mail, Menu, Plus, Scissors, Search,
  Sparkles, Users, X, ChartNoAxesCombined, Send, Pencil, Trash2, CircleAlert,
} from 'lucide-react';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#9d6857',
    colorForeground: '#392f2a',
    colorMutedForeground: '#78695e',
    colorDanger: '#a34f43',
    colorBackground: '#fcfaf6',
    colorInput: '#fffdf9',
    colorInputForeground: '#392f2a',
    colorNeutral: '#d9cec2',
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fcfaf6] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-[0_24px_80px_rgba(68,48,37,.16)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-serif text-[#392f2a]',
    headerSubtitle: 'text-[#78695e]',
    socialButtonsBlockButtonText: 'font-semibold text-[#493d36]',
    formFieldLabel: 'font-semibold text-[#5e5148]',
    footerActionLink: 'font-semibold text-[#8e594b]',
    footerActionText: 'text-[#78695e]',
    dividerText: 'text-[#8c7d72]',
    identityPreviewEditButton: 'text-[#8e594b]',
    formFieldSuccessText: 'text-[#55715c]',
    alertText: 'text-[#8f473c]',
    logoBox: 'mb-4',
    logoImage: 'max-h-12',
    socialButtonsBlockButton: 'border-[#ded3c8] bg-[#fffdf9] hover:bg-[#f3ece4]',
    formButtonPrimary: 'bg-[#9d6857] hover:bg-[#805344] text-[#fffaf4]',
    formFieldInput: 'border-[#d9cec2] bg-[#fffdf9] text-[#392f2a] focus:border-[#9d6857]',
    footerAction: 'border-0 bg-transparent',
    dividerLine: 'bg-[#e8ded4]',
    alert: 'border-[#e6c9c2] bg-[#fbf1ed]',
    otpCodeFieldInput: 'border-[#d9cec2] bg-[#fffdf9] text-[#392f2a]',
    formFieldRow: 'mb-4',
    main: 'text-[#392f2a]',
  },
};
const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
const dateLabel = (value: string) => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(value));
const timeLabel = (value: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const icsEscape = (value: string) => value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\r?\n/g, '\\n');
const icsTimestamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function downloadAppointmentInvite(booking: Booking) {
  const event = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mallinabella Salon//Appointment//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${icsEscape(booking.id)}@mallinabella`,
    `DTSTAMP:${icsTimestamp(new Date().toISOString())}`,
    `DTSTART:${icsTimestamp(booking.startAt)}`,
    `DTEND:${icsTimestamp(booking.endAt)}`,
    `SUMMARY:${icsEscape(`${booking.serviceName} with ${booking.stylistName}`)}`,
    `DESCRIPTION:${icsEscape(`Appointment for ${booking.clientName}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([event], { type: 'text/calendar;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `mallinabella-appointment-${booking.id}.ics`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
const todayISO = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3" aria-label="Loading">
    {Array.from({ length: rows }, (_, index) => <div key={index} className="h-14 animate-pulse bg-[#e9e1d7]" />)}
  </div>;
}
function QueryError({ retry }: { retry: () => void }) {
  return <div className="flex items-center gap-3 border border-[#e6c9c2] bg-[#fbf1ed] p-4 text-sm text-[#78483d]" role="alert">
    <CircleAlert size={18} /><span>We couldn’t load this just now.</span>
    <button className="ml-auto underline underline-offset-4" onClick={retry} data-testid="button-retry">Try again</button>
  </div>;
}
function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`inline-flex items-center gap-3 ${light ? 'text-[#f8f1e8]' : 'text-[#392f2a]'}`} data-testid="link-brand">
    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-current/35"><Flower2 size={19} strokeWidth={1.35} /></span>
    <span className="leading-tight"><span className="serif block text-[20px] tracking-[.035em]">Mallinabella</span><span className="block pt-0.5 text-[8px] font-semibold tracking-[.28em] opacity-70">SALON · BEAUTY STUDIO</span></span>
  </Link>;
}

function PublicAuthActions() {
  const { signOut } = useClerk();
  const { user } = useUser();
  return <>
    <Show when="signed-out">
      <Link href="/sign-in" className="opacity-80 transition-opacity hover:opacity-100" data-testid="link-sign-in">Sign in</Link>
      <Link href="/sign-up" className="opacity-80 transition-opacity hover:opacity-100" data-testid="link-sign-up">Create account</Link>
    </Show>
    <Show when="signed-in">
      <Link href="/account" className="opacity-80 transition-opacity hover:opacity-100" data-testid="link-my-account">{user?.firstName || 'My account'}</Link>
      <button className="opacity-70 transition-opacity hover:opacity-100" onClick={() => void signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">Sign out</button>
    </Show>
  </>;
}

function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="absolute inset-x-0 top-0 z-20 border-b border-white/20 text-[#fcf7f0]">
    <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-10">
      <Brand light />
      <nav className="hidden items-center gap-9 text-[10px] font-semibold uppercase tracking-[.18em] md:flex">
        <a href="#services" className="transition-opacity hover:opacity-70">Services</a><a href="#story" className="transition-opacity hover:opacity-70">Our salon</a><a href="#team" className="transition-opacity hover:opacity-70">Artists</a>
        <Show when="signed-in"><Link href="/admin" className="opacity-70 transition-opacity hover:opacity-100" data-testid="link-staff">Staff portal</Link></Show>
        <PublicAuthActions />
        <a href="#book" className="border border-[#f5e9dc]/60 px-5 py-3 transition-colors hover:bg-[#f5e9dc] hover:text-[#382f2b]">Book a visit</a>
      </nav>
      <button aria-label="Toggle navigation" className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} data-testid="button-mobile-menu">{menuOpen ? <X /> : <Menu />}</button>
    </div>
    {menuOpen && <nav className="grid gap-4 border-t border-white/20 bg-[#352d29]/95 px-6 py-5 text-xs uppercase tracking-[.15em] md:hidden">
      <a href="#services" onClick={() => setMenuOpen(false)}>Services</a><a href="#story" onClick={() => setMenuOpen(false)}>Our salon</a><a href="#team" onClick={() => setMenuOpen(false)}>Artists</a>
      <a href="#book" onClick={() => setMenuOpen(false)}>Book a visit</a>
      <PublicAuthActions />
      <Show when="signed-in"><Link href="/admin" data-testid="link-staff-mobile">Staff portal</Link></Show>
    </nav>}
  </header>;
}

function BookingForm() {
  const client = useQueryClient();
  const servicesQuery = useListServices();
  const stylistsQuery = useListStylists();
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [stylistId, setStylistId] = useState('');
  const [slot, setSlot] = useState('');
  const [requestedAccount, setRequestedAccount] = useState(false);
  const [confirmation, setConfirmation] = useState<Booking | null>(null);
  const [message, setMessage] = useState('');
  const bookingMutation = useCreateBooking();
  const availabilityParams = useMemo(() => ({
    serviceId: serviceId ?? 0,
    date,
    ...(stylistId ? { stylistId } : {}),
  }), [serviceId, date, stylistId]);
  const availabilityQuery = useGetAvailability(availabilityParams, {
    query: { enabled: !!serviceId && !!date, queryKey: getGetAvailabilityQueryKey(availabilityParams) },
  });
  const services = (servicesQuery.data ?? []).filter((service) => service.active);
  const slots = availabilityQuery.data ?? [];
  const chosenService = services.find((service) => service.id === serviceId);
  const selectedSlot = slots.find((item) => item.startAt === slot);
  const submitBooking = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!chosenService || !selectedSlot) return;
    const data = new FormData(event.currentTarget);
    const accountRequest = data.get('accountRequested') === 'on';
    setRequestedAccount(accountRequest);
    setMessage('');
    bookingMutation.mutate({
      data: {
        serviceId: chosenService.id,
        stylistId: selectedSlot.stylistId,
        clientName: String(data.get('clientName') || ''),
        email: String(data.get('email') || ''),
        phone: String(data.get('phone') || ''),
        startAt: selectedSlot.startAt,
        notes: String(data.get('notes') || ''),
        marketingOptIn: data.get('marketingOptIn') === 'on',
        accountRequested: accountRequest,
      },
    }, {
      onSuccess: (booking) => {
        setConfirmation(booking);
        setSlot('');
        void client.invalidateQueries({ queryKey: getListBookingsQueryKey() });
        void client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        void client.invalidateQueries({ queryKey: getGetAvailabilityQueryKey(availabilityParams) });
      },
      onError: () => setMessage('That time may have just been taken. Please choose another opening.'),
    });
  };
  return <section id="book" className="scroll-mt-10 bg-[#eee5d9] px-5 py-16 md:px-10 md:py-24">
    <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[.72fr_1fr] lg:gap-20">
      <div className="pt-2">
        <p className="eyebrow">Your time, beautifully spent</p>
        <h2 className="serif mt-4 max-w-md text-4xl leading-[1.12] text-[#362d29] md:text-5xl">A little time for <i>you.</i></h2>
        <p className="mt-5 max-w-sm text-sm leading-7 text-[#6d5e53]">Choose your service, find a time that feels right, and leave the rest to us.</p>
        <div className="mt-9 border-t border-[#d4c6b8] pt-5 text-xs text-[#8c7d72]">
          Contact details to be added.
        </div>
      </div>
      <div className="bg-[#fcfaf6] p-5 shadow-[0_16px_50px_rgba(68,48,37,.08)] md:p-9">
        {confirmation ? <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e7ede4] text-[#54705d]"><Check size={25} /></span>
          <p className="eyebrow mt-6">You’re on our calendar</p>
          <h3 className="serif mt-3 text-3xl">We can’t wait to see you.</h3>
          <p className="mt-3 max-w-sm text-sm leading-6 text-[#76675c]">{confirmation.serviceName} with {confirmation.stylistName}<br />{dateLabel(confirmation.startAt)} at {timeLabel(confirmation.startAt)}</p>
          <button onClick={() => downloadAppointmentInvite(confirmation)} className="btn-primary mt-6" data-testid="button-download-invite"><CalendarDays size={15} /> Download calendar invite</button>
          {(requestedAccount || confirmation.accountRequested) && <div className="mt-6 max-w-sm border-t border-[#e6ddd3] pt-5"><p className="serif text-lg">Keep your appointments close.</p><p className="mt-1 text-xs leading-5 text-[#76675c]">Create an account to see your salon booking history in one place.</p><Link href="/sign-up" className="mt-3 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#9d6857]" data-testid="link-create-requested-account">Create your account <ArrowRight size={13} /></Link></div>}
          <button onClick={() => { setConfirmation(null); setRequestedAccount(false); }} className="btn-outline mt-6" data-testid="button-book-another">Book another visit</button>
        </div> : <form onSubmit={submitBooking} className="space-y-6">
          <div className="flex items-center justify-between"><p className="eyebrow">Reserve your appointment</p><span className="text-[10px] tracking-[.16em] text-[#998a7f]">01 / 03</span></div>
          {servicesQuery.isLoading ? <LoadingBlock rows={2} /> : servicesQuery.isError ? <QueryError retry={() => void servicesQuery.refetch()} /> : <>
            <div>
              <label className="field-label" htmlFor="booking-service">Choose a service</label>
              <select id="booking-service" className="field" required value={serviceId ?? ''} onChange={(event) => { setServiceId(event.target.value ? Number(event.target.value) : null); setSlot(''); }} data-testid="select-booking-service">
                <option value="">Select a service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationMinutes} min · {money(service.price)}</option>)}
              </select>
            </div>
            {serviceId && <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="field-label" htmlFor="booking-date">Choose a day</label><input id="booking-date" type="date" min={todayISO()} value={date} onChange={(event) => { setDate(event.target.value); setSlot(''); }} required className="field" data-testid="input-booking-date" /></div>
              <div><label className="field-label" htmlFor="booking-stylist">Preferred artist</label><select id="booking-stylist" className="field" value={stylistId} onChange={(event) => { setStylistId(event.target.value); setSlot(''); }} data-testid="select-booking-stylist"><option value="">Any available artist</option>{(stylistsQuery.data ?? []).map((stylist) => <option key={stylist.id} value={stylist.id}>{stylist.name}</option>)}</select></div>
            </div>}
            {serviceId && <div>
              <label className="field-label">Available times</label>
              {availabilityQuery.isLoading ? <div className="grid grid-cols-3 gap-2"><LoadingBlock rows={2} /></div> : availabilityQuery.isError ? <QueryError retry={() => void availabilityQuery.refetch()} /> : slots.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((available) => <button type="button" key={`${available.stylistId}-${available.startAt}`} onClick={() => setSlot(available.startAt)} className={`border px-2 py-3 text-xs transition-colors ${slot === available.startAt ? 'border-[#9d6857] bg-[#9d6857] text-white' : 'border-[#ded3c8] text-[#5d5048] hover:border-[#9d6857]'}`} data-testid={`button-time-${available.startAt}`}>{timeLabel(available.startAt)}<span className="mt-1 block text-[9px] opacity-75">{available.stylistName}</span></button>)}
              </div> : <div className="bg-[#f2ece4] px-4 py-3 text-xs leading-5 text-[#77695e]">No openings for this day. Please try a different date.</div>}
            </div>}
          </>}
          {!!slot && <div className="grid gap-4 border-t border-[#e6ddd3] pt-5 sm:grid-cols-2">
            <div><label className="field-label" htmlFor="booking-name">Your name</label><input id="booking-name" name="clientName" required minLength={2} className="field" placeholder="Full name" data-testid="input-client-name" /></div>
            <div><label className="field-label" htmlFor="booking-phone">Phone</label><input id="booking-phone" name="phone" type="tel" required minLength={6} className="field" placeholder="(555) 555-5555" data-testid="input-client-phone" /></div>
            <div className="sm:col-span-2"><label className="field-label" htmlFor="booking-email">Email address</label><input id="booking-email" name="email" type="email" required className="field" placeholder="you@example.com" data-testid="input-client-email" /></div>
            <div className="sm:col-span-2"><label className="field-label" htmlFor="booking-notes">Anything we should know? <span className="font-normal">(optional)</span></label><textarea id="booking-notes" name="notes" rows={2} className="field resize-y" placeholder="A little note for your artist" data-testid="input-booking-notes" /></div>
            <label className="flex items-start gap-2 text-xs leading-5 text-[#71645a] sm:col-span-2"><input name="marketingOptIn" type="checkbox" className="mt-1 accent-[#9d6857]" data-testid="check-marketing-optin" /> I’d love occasional notes, offers and salon news.</label>
            <label className="flex items-start gap-2 text-xs leading-5 text-[#71645a] sm:col-span-2"><input name="accountRequested" type="checkbox" className="mt-1 accent-[#9d6857]" data-testid="check-account-requested" /> I’d like to request a salon account for easier future bookings.</label>
          </div>}
          {message && <p className="text-sm text-[#994d40]" role="alert">{message}</p>}
          <button type="submit" disabled={!slot || bookingMutation.isPending} className="btn-primary w-full" data-testid="button-confirm-booking">{bookingMutation.isPending ? 'Reserving your time…' : <>Confirm appointment <ArrowRight size={16} /></>}</button>
          <p className="text-center text-[10px] leading-5 text-[#9a8c81]">By booking, you agree to our 24-hour cancellation policy.</p>
        </form>}
      </div>
    </div>
  </section>;
}

function PublicHome() {
  const servicesQuery = useListServices();
  const stylistsQuery = useListStylists();
  const [category, setCategory] = useState('All');
  const activeServices = (servicesQuery.data ?? []).filter((service) => service.active);
  const categories = ['All', ...Array.from(new Set(activeServices.map((service) => service.category)))];
  const visibleServices = category === 'All' ? activeServices : activeServices.filter((service) => service.category === category);
  return <main className="salon-shell">
    <section className="relative flex min-h-[690px] items-end overflow-hidden bg-[#342b28] pb-14 text-[#f8f1e8] md:min-h-[800px] md:pb-20">
      <div className="absolute inset-0 opacity-80" style={{ background: 'radial-gradient(ellipse at 78% 43%, #9a7161 0%, #6e5147 22%, transparent 49%), radial-gradient(ellipse at 73% 94%, #b78e71 0%, transparent 28%), linear-gradient(115deg,#332b28 2%,#493a34 50%,#72564a 100%)' }} />
      <div className="absolute inset-0 opacity-[.16]" style={{ backgroundImage: 'repeating-linear-gradient(117deg, transparent 0px, transparent 28px, #eed9c81c 29px, transparent 30px)' }} />
      <div className="absolute right-[-8%] top-[17%] h-[450px] w-[450px] rounded-full border border-[#f3e3d2]/20 md:right-[10%] md:h-[580px] md:w-[580px]" />
      <div className="absolute right-[2%] top-[23%] h-[350px] w-[350px] rounded-full border border-[#f3e3d2]/15 md:right-[17%] md:h-[460px] md:w-[460px]" />
      <PublicHeader />
      <div className="relative mx-auto w-full max-w-7xl px-5 md:px-10">
        <div className="max-w-[750px] rise-in">
          <div className="mb-6 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[.25em] text-[#e8cbbb]"><span className="h-px w-10 bg-[#c89279]" /> A modern ritual of beauty</div>
          <h1 className="serif text-[clamp(3.5rem,9vw,7.5rem)] leading-[.94] tracking-[-.04em]">Come as you are.<br /><i className="font-medium text-[#d9ae9b]">Leave luminous.</i></h1>
          <p className="mt-7 max-w-lg text-sm leading-7 text-[#e3d6cb] md:text-base">A considered salon experience, shaped around you. Thoughtful hands, beautiful details, and space to feel like yourself.</p>
          <div className="mt-9 flex flex-wrap items-center gap-5"><a href="#book" className="inline-flex items-center gap-3 bg-[#d2a38d] px-6 py-4 text-[10px] font-bold uppercase tracking-[.16em] text-[#392e29] transition-transform hover:-translate-y-0.5" data-testid="link-hero-book">Find your moment <ArrowRight size={15} /></a><a href="#services" className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#e7d9cf]">Explore the menu <ArrowDown className="ml-2 inline" size={14} /></a></div>
          <div className="mt-14 flex items-center gap-5 border-t border-[#f1dfd0]/20 pt-5 text-[10px] uppercase tracking-[.15em] text-[#d7c5b8]"><span>A salon for all of you</span><span className="h-1 w-1 rounded-full bg-[#cb957d]" /><span>Care, with character</span></div>
        </div>
      </div>
      <div className="absolute bottom-8 right-8 hidden text-[9px] uppercase tracking-[.22em] text-[#e4d2c4]/70 [writing-mode:vertical-rl] md:block">Find your own kind of beautiful</div>
    </section>
    <section className="grid grid-cols-2 bg-[#dfd0c1] text-[#473a33] md:grid-cols-4">
      {[['01', 'Considered care'], ['02', 'Artists with a point of view'], ['03', 'Only what you need'], ['04', 'Beauty that feels like you']].map(([number, text]) => <div key={number} className="border-b border-r border-[#cdbbab] px-5 py-6 md:px-8 md:py-8"><span className="eyebrow">{number}</span><p className="serif mt-2 text-sm md:text-lg">{text}</p></div>)}
    </section>
    <section id="services" className="scroll-mt-10 px-5 py-16 md:px-10 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div><p className="eyebrow">The service menu</p><h2 className="serif mt-3 text-4xl leading-tight md:text-5xl">Care, with a little <i>character.</i></h2></div>
          <p className="max-w-sm text-sm leading-6 text-[#76695e]">Good work starts with listening. Every service is tailored to your hair, your skin, your pace.</p>
        </div>
        <div className="mt-8 flex flex-wrap gap-2">{categories.map((item) => <button key={item} className={`border px-4 py-2 text-[10px] uppercase tracking-[.15em] ${category === item ? 'border-[#9d6857] bg-[#9d6857] text-white' : 'border-[#d8ccbf] text-[#63564d] hover:border-[#9d6857]'}`} onClick={() => setCategory(item)} data-testid={`button-category-${item.toLowerCase().replaceAll(' ', '-')}`}>{item}</button>)}</div>
        {servicesQuery.isLoading ? <div className="mt-8"><LoadingBlock rows={4} /></div> : servicesQuery.isError ? <div className="mt-8"><QueryError retry={() => void servicesQuery.refetch()} /></div> : visibleServices.length ? <div className="mt-7 divide-y divide-[#dfd5ca] border-y border-[#dfd5ca]">
          {visibleServices.map((service, index) => <ServiceRow key={service.id} service={service} index={index} />)}
        </div> : <div className="mt-8 border border-dashed border-[#d6c9bc] p-8 text-sm text-[#76695e]">Our team is refreshing the menu. Please check back soon.</div>}
      </div>
    </section>
    <section id="story" className="bg-[#473a34] px-5 py-16 text-[#f7f0e7] md:px-10 md:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-[1.05fr_.95fr] md:gap-20">
        <div className="relative min-h-[330px] overflow-hidden bg-[#8b6b5b] p-7 md:min-h-[470px] md:p-10">
          <div className="absolute inset-0 opacity-60" style={{ background: 'radial-gradient(ellipse at 70% 20%,#d7b7a1 0,transparent 40%),linear-gradient(145deg,#977766,#443833)' }} />
          <div className="absolute inset-5 border border-[#f4e7d8]/35 md:inset-7" />
          <div className="relative flex h-full min-h-[280px] flex-col justify-between md:min-h-[410px]">
            <span className="serif text-6xl text-[#f7e9dc]/70">M.</span>
            <div><p className="eyebrow !text-[#edc7b2]">The Mallinabella feeling</p><p className="serif mt-3 max-w-sm text-3xl leading-tight md:text-4xl">Beauty should feel like coming home to yourself.</p></div>
            <p className="text-[9px] uppercase tracking-[.22em] text-[#f1ded0]/75">A little more you, every day</p>
          </div>
        </div>
        <div>
          <p className="eyebrow !text-[#d5a38b]">A salon with a softer edge</p><h2 className="serif mt-4 text-4xl leading-[1.15] md:text-5xl">A good appointment changes more than your hair.</h2>
          <p className="mt-6 text-sm leading-7 text-[#e0d3c9]">It’s the deep breath when you arrive. The thoughtful question before the first snip. The quiet confidence you carry out with you. Mallinabella is a neighborhood salon built on the belief that feeling cared for is part of the beauty.</p>
          <a href="#book" className="mt-8 inline-flex items-center gap-3 border-b border-[#c48e75] pb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[#e5b9a2]">Meet us in the chair <ArrowRight size={14} /></a>
        </div>
      </div>
    </section>
    <section id="team" className="px-5 py-16 md:px-10 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow">The hands behind the feeling</p><h2 className="serif mt-3 text-4xl md:text-5xl">Meet your artists.</h2></div><p className="max-w-sm text-sm leading-6 text-[#76695e]">Good people, good instincts, and a shared love of making the everyday feel special.</p></div>
        {stylistsQuery.isLoading ? <div className="mt-9"><LoadingBlock rows={3} /></div> : stylistsQuery.isError ? <div className="mt-9"><QueryError retry={() => void stylistsQuery.refetch()} /></div> : (stylistsQuery.data ?? []).length ? <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(stylistsQuery.data ?? []).map((stylist, index) => <article className={`group relative min-h-[260px] overflow-hidden bg-[#e5d9cc] p-6 ${index === 1 ? 'bg-[#d9c8b9]' : ''}`} key={stylist.id}>
            {stylist.imageUrl ? <img src={stylist.imageUrl} alt={stylist.name} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" /> : <div className="absolute inset-0" style={{ background: index % 2 ? 'radial-gradient(ellipse at 73% 25%,#c8a391,#9a7666 42%,#52433c)' : 'radial-gradient(ellipse at 70% 23%,#dec6b1,#b69a86 40%,#67564e)' }} />}
            <div className="absolute inset-0 bg-gradient-to-t from-[#241c19]/80 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 p-6 text-[#fff8ef]"><p className="eyebrow !text-[#edc5ae]">{stylist.title}</p><h3 className="serif mt-1 text-2xl">{stylist.name}</h3></div>
          </article>)}
        </div> : <p className="mt-8 text-sm text-[#76695e]">Our artists will be introduced here soon.</p>}
      </div>
    </section>
    <section className="bg-[#d8c0b0] px-5 py-14 text-center md:px-10 md:py-20">
      <Sparkles size={20} className="mx-auto text-[#865c4e]" /><p className="eyebrow mt-4">A note from Mallinabella</p><p className="serif mx-auto mt-4 max-w-3xl text-3xl leading-tight text-[#443832] md:text-4xl">“The best version of beautiful is the one that still feels like you.”</p>
      <a href="#book" className="btn-primary mt-7" data-testid="link-quote-book">Find your chair <ArrowRight size={15} /></a>
    </section>
    <BookingForm />
    <footer className="bg-[#302925] px-5 py-11 text-[#f3e9de] md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-center md:justify-between"><Brand light /><p className="text-xs text-[#b9a99d]">Contact details to be added.</p><div className="flex gap-4"><a href="#book" aria-label="Appointment booking" data-testid="link-footer-book"><CalendarDays size={17} /></a><a href="#team" aria-label="Meet the salon artists" data-testid="link-footer-artists"><Flower2 size={17} /></a></div></div>
      <div className="mx-auto mt-8 flex max-w-6xl justify-between border-t border-white/10 pt-5 text-[9px] uppercase tracking-[.16em] text-[#9e8d81]"><span>© Mallinabella Salon</span><Link href="/admin" data-testid="link-footer-staff">Staff access</Link></div>
    </footer>
  </main>;
}
function ServiceRow({ service, index }: { service: Service; index: number }) {
  return <article className="group grid gap-3 py-5 md:grid-cols-[50px_1fr_auto] md:items-center md:gap-5" data-testid={`row-service-${service.id}`}>
    <span className="serif text-xl text-[#c49b83]">0{index + 1}</span>
    <div><p className="eyebrow text-[9px]">{service.category}</p><h3 className="serif mt-1 text-xl text-[#453a33]">{service.name}</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-[#82756b]">{service.description}</p></div>
    <div className="flex items-center justify-between gap-8 border-t border-[#e4dbd1] pt-3 md:border-0 md:pt-0"><span className="flex items-center gap-2 text-[10px] text-[#82756b]"><Clock3 size={13} /> {service.durationMinutes} min</span><span className="serif text-xl text-[#493b34]">{money(service.price)}</span><a href="#book" className="hidden text-[#9d6857] transition-transform group-hover:translate-x-1 md:block" aria-label={`Book ${service.name}`} data-testid={`link-book-service-${service.id}`}><ArrowRight size={17} /></a></div>
  </article>;
}

type AdminTab = 'overview' | 'calendar' | 'clients' | 'services' | 'campaigns';
const adminTabs: { id: AdminTab; label: string; icon: typeof CalendarDays }[] = [
  { id: 'overview', label: 'Overview', icon: ChartNoAxesCombined },
  { id: 'calendar', label: 'Schedule', icon: CalendarDays },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'services', label: 'Services', icon: Scissors },
  { id: 'campaigns', label: 'Campaigns', icon: Send },
];
function AdminShell() {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [mobileMenu, setMobileMenu] = useState(false);
  return <div className="salon-shell min-h-[100dvh] md:grid md:grid-cols-[238px_1fr]">
    <aside className="relative z-10 bg-[#342d29] px-5 py-5 text-[#f6eee5] md:sticky md:top-0 md:flex md:h-[100dvh] md:flex-col md:px-6 md:py-7">
      <div className="flex items-center justify-between"><Brand light /><button className="md:hidden" aria-label="Toggle admin navigation" onClick={() => setMobileMenu(!mobileMenu)} data-testid="button-admin-menu">{mobileMenu ? <X /> : <Menu />}</button></div>
      <div className={`${mobileMenu ? 'block' : 'hidden'} mt-8 md:block`}>
        <p className="mb-3 px-3 text-[9px] font-semibold uppercase tracking-[.22em] text-[#a9998d]">Salon studio</p>
        <nav className="space-y-1">{adminTabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setTab(id); setMobileMenu(false); }} className={`flex w-full items-center gap-3 px-3 py-3 text-left text-sm transition-colors ${tab === id ? 'bg-[#51413a] text-[#f1c9b3]' : 'text-[#d7c9bf] hover:bg-white/5'}`} data-testid={`button-admin-tab-${id}`}><Icon size={16} strokeWidth={1.7} />{label}</button>)}</nav>
      </div>
      <div className="mt-8 hidden border-t border-white/10 pt-5 md:block"><p className="px-3 text-[9px] uppercase tracking-[.19em] text-[#a9998d]">Quick links</p><Link href="/" className="mt-3 flex items-center gap-3 px-3 py-2 text-xs text-[#d7c9bf] hover:text-white" data-testid="link-public-site"><ArrowLeft size={15} /> View salon site</Link><Link href="/account" className="flex items-center gap-3 px-3 py-2 text-xs text-[#d7c9bf] hover:text-white" data-testid="link-admin-account"><Users size={15} /> Client account</Link></div>
      <div className="mt-auto hidden border-t border-white/10 pt-5 md:block"><p className="px-3 text-[9px] uppercase tracking-[.17em] text-[#a9998d]">Mallinabella Salon</p><p className="px-3 pt-1 text-xs text-[#d7c9bf]">Contact details to be added.</p></div>
    </aside>
    <main className="min-w-0 px-4 pb-12 pt-7 md:px-8 lg:px-12 lg:pt-10">
      <div className="mx-auto max-w-[1360px]">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[#dfd4c8] pb-6">
          <div><p className="eyebrow">Salon studio · {new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</p><h1 className="serif mt-2 text-3xl md:text-4xl">{tab === 'overview' ? 'A lovely day to be here.' : adminTabs.find((item) => item.id === tab)?.label}</h1></div>
          <Link href="/" className="btn-outline text-[10px] md:hidden" data-testid="link-public-site-mobile">View salon <ArrowRight size={14} /></Link>
        </header>
        {tab === 'overview' && <Overview onSchedule={() => setTab('calendar')} />}
        {tab === 'calendar' && <Schedule />}
        {tab === 'clients' && <Clients />}
        {tab === 'services' && <ServiceManager />}
        {tab === 'campaigns' && <CampaignManager />}
      </div>
    </main>
  </div>;
}

function Overview({ onSchedule }: { onSchedule: () => void }) {
  const summaryQuery = useGetDashboardSummary();
  const summary = summaryQuery.data;
  if (summaryQuery.isLoading) return <LoadingBlock rows={5} />;
  if (summaryQuery.isError || !summary) return <QueryError retry={() => void summaryQuery.refetch()} />;
  const metrics = [
    { label: 'Today’s visits', value: summary.todayBookings, note: 'appointments on the books', icon: CalendarDays },
    { label: 'Upcoming', value: summary.upcomingBookings, note: 'future appointments', icon: Clock3 },
    { label: 'Monthly revenue', value: money(summary.monthlyRevenue), note: 'this calendar month', icon: ChartNoAxesCombined },
    { label: 'Clients', value: summary.totalClients, note: `${summary.marketingClients} opted in to updates`, icon: Users },
  ];
  return <div className="rise-in space-y-8">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, note, icon: Icon }) => <article className="border border-[#e3d9ce] bg-[#fcfaf6] p-5" key={label} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="flex items-start justify-between"><p className="text-xs text-[#78695e]">{label}</p><Icon size={17} className="text-[#a16d59]" /></div><p className="serif mt-5 text-3xl text-[#413630]">{value}</p><p className="mt-1 text-[10px] text-[#98897d]">{note}</p></article>)}</div>
    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
      <section className="border border-[#e3d9ce] bg-[#fcfaf6]">
        <div className="flex items-center justify-between border-b border-[#e7ded5] px-5 py-4"><div><p className="eyebrow">Coming up</p><h2 className="serif mt-1 text-xl">Next appointments</h2></div><button onClick={onSchedule} className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#9d6857]" data-testid="button-view-schedule">Full schedule <ArrowRight size={13} className="ml-1 inline" /></button></div>
        <div className="divide-y divide-[#eee6de]">{summary.nextAppointments.length ? summary.nextAppointments.slice(0, 6).map((booking) => <BookingLine key={booking.id} booking={booking} compact />) : <div className="px-5 py-12 text-center"><CalendarDays className="mx-auto text-[#ad9684]" size={23} /><p className="serif mt-3 text-lg">A little space in the day.</p><p className="mt-1 text-xs text-[#8e7e72]">Your next appointment will appear here.</p></div>}</div>
      </section>
      <section className="flex flex-col justify-between bg-[#e8d9ca] p-6 md:p-8">
        <div><p className="eyebrow">Small things, done well</p><h2 className="serif mt-4 text-3xl leading-tight">Make room for a little more beautiful.</h2><p className="mt-3 max-w-sm text-sm leading-6 text-[#705f54]">Keep your calendar in rhythm, your clients remembered, and your studio growing.</p></div>
        <div className="mt-8 flex flex-wrap gap-2"><button onClick={onSchedule} className="btn-primary" data-testid="button-overview-schedule">See schedule <ArrowRight size={14} /></button></div>
      </section>
    </div>
  </div>;
}
function BookingLine({ booking, compact = false, actions }: { booking: Booking; compact?: boolean; actions?: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 px-4 py-4 md:px-5" data-testid={`row-booking-${booking.id}`}>
    <div className="w-14 shrink-0 text-center"><span className="serif block text-lg text-[#473a33]">{new Intl.DateTimeFormat('en-US', { day: '2-digit' }).format(new Date(booking.startAt))}</span><span className="text-[8px] uppercase tracking-[.12em] text-[#9a887c]">{new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(booking.startAt))}</span></div>
    <div className="min-w-[145px] flex-1"><p className="text-sm font-semibold text-[#493d36]">{booking.clientName}</p><p className="mt-1 text-[10px] text-[#8c7c70]">{booking.serviceName} · {booking.stylistName}</p></div>
    <div className="text-xs text-[#6e5f55]">{timeLabel(booking.startAt)}{!compact && <span className="ml-2 text-[#9a887c]">— {timeLabel(booking.endAt)}</span>}</div>
    <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.08em] ${booking.status === 'confirmed' ? 'bg-[#e7eee4] text-[#55715c]' : booking.status === 'completed' ? 'bg-[#eee8df] text-[#76695e]' : 'bg-[#f5e4df] text-[#9a5b4d]'}`} data-testid={`status-booking-${booking.id}`}>{booking.status}</span>
    {actions}
  </div>;
}
function Schedule() {
  const client = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const bookingsQuery = useListBookings();
  const updateMutation = useUpdateBooking();
  const bookings = (bookingsQuery.data ?? []).filter((booking) => booking.startAt.slice(0, 10) === date).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const changeStatus = (booking: Booking, status: 'completed' | 'cancelled') => updateMutation.mutate({ bookingId: booking.id, data: { status } }, { onSuccess: () => {
    void client.invalidateQueries({ queryKey: getListBookingsQueryKey() }); void client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); void client.invalidateQueries({ queryKey: getListClientsQueryKey() });
  } });
  return <section className="border border-[#e3d9ce] bg-[#fcfaf6] rise-in">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e7ded5] p-5 md:px-7 md:py-6"><div><p className="eyebrow">The day, at a glance</p><h2 className="serif mt-1 text-2xl">Appointment schedule</h2></div><div className="flex items-center gap-3"><label className="field-label mb-0" htmlFor="schedule-date">Day</label><input type="date" id="schedule-date" value={date} onChange={(event) => setDate(event.target.value)} className="field w-auto" data-testid="input-schedule-date" /></div></div>
    {bookingsQuery.isLoading ? <div className="p-5"><LoadingBlock rows={5} /></div> : bookingsQuery.isError ? <div className="p-5"><QueryError retry={() => void bookingsQuery.refetch()} /></div> : bookings.length ? <div className="divide-y divide-[#eee6de]">{bookings.map((booking) => <BookingLine key={booking.id} booking={booking} actions={booking.status === 'confirmed' ? <div className="ml-auto flex gap-2"><button className="btn-outline px-2.5 py-2 text-[9px]" disabled={updateMutation.isPending} onClick={() => changeStatus(booking, 'completed')} data-testid={`button-complete-${booking.id}`}>Complete</button><button className="border border-[#e5d5ce] px-2.5 py-2 text-[9px] text-[#9b5b4e] hover:bg-[#fbf0ec]" disabled={updateMutation.isPending} onClick={() => changeStatus(booking, 'cancelled')} data-testid={`button-cancel-${booking.id}`}>Cancel</button></div> : undefined} />)}</div> : <div className="px-5 py-16 text-center"><CalendarDays className="mx-auto text-[#a48a78]" size={25} /><h3 className="serif mt-4 text-xl">A clear day, for now.</h3><p className="mt-2 text-xs text-[#8c7d72]">Appointments for {dateLabel(`${date}T12:00:00`)} will show here.</p></div>}
  </section>;
}
function Clients() {
  const [search, setSearch] = useState('');
  const query = useListClients(search ? { search } : undefined);
  const clients = query.data ?? [];
  return <section className="border border-[#e3d9ce] bg-[#fcfaf6] rise-in">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e7ded5] p-5 md:px-7 md:py-6"><div><p className="eyebrow">The people who make the salon</p><h2 className="serif mt-1 text-2xl">Client book</h2></div><label className="relative block w-full sm:w-64"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#907f73]" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" className="field pl-9" aria-label="Search clients" data-testid="input-client-search" /></label></div>
    {query.isLoading ? <div className="p-5"><LoadingBlock rows={6} /></div> : query.isError ? <div className="p-5"><QueryError retry={() => void query.refetch()} /></div> : clients.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] border-collapse text-left"><thead className="bg-[#f5f0e9] text-[9px] uppercase tracking-[.15em] text-[#8b7b70]"><tr>{['Client', 'Contact', 'Visits', 'Last visit', 'Updates'].map((heading) => <th key={heading} className="px-5 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[#eee6de]">{clients.map((client) => <tr key={client.id} className="text-xs" data-testid={`row-client-${client.id}`}><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eadbd0] text-[10px] font-semibold text-[#805a4d]">{client.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span className="font-semibold text-[#493d36]">{client.name}</span></div></td><td className="px-5 py-4 text-[#76695e]">{client.email}<span className="mt-1 block text-[10px] text-[#9b8c80]">{client.phone}</span></td><td className="px-5 py-4 text-[#55483f]">{client.totalVisits}</td><td className="px-5 py-4 text-[#76695e]">{client.lastVisit ? dateLabel(client.lastVisit) : '—'}</td><td className="px-5 py-4">{client.marketingOptIn ? <span className="bg-[#e7eee4] px-2 py-1 text-[9px] text-[#55715c]">Opted in</span> : <span className="text-[#a39488]">Not opted in</span>}</td></tr>)}</tbody></table></div> : <div className="px-5 py-16 text-center"><Users className="mx-auto text-[#a48a78]" size={25} /><h3 className="serif mt-4 text-xl">{search ? 'No client found.' : 'Your client book is waiting.'}</h3><p className="mt-2 text-xs text-[#8c7d72]">{search ? 'Try another name or email address.' : 'Clients will appear here after their first appointment.'}</p></div>}
  </section>;
}
type ServiceDraft = { name: string; category: string; description: string; durationMinutes: string; price: string };
const emptyService: ServiceDraft = { name: '', category: '', description: '', durationMinutes: '60', price: '' };
function ServiceManager() {
  const client = useQueryClient();
  const query = useListServices();
  const create = useCreateService();
  const update = useUpdateService();
  const remove = useDeleteService();
  const [editing, setEditing] = useState<Service | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const services = query.data ?? [];
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values: ServiceInput = { name: String(data.get('name') || ''), category: String(data.get('category') || ''), description: String(data.get('description') || ''), durationMinutes: Number(data.get('durationMinutes')), price: Number(data.get('price')) };
    setError('');
    const done = () => { setCreating(false); setEditing(null); void client.invalidateQueries({ queryKey: getListServicesQueryKey() }); };
    if (editing) update.mutate({ serviceId: editing.id, data: values }, { onSuccess: done, onError: () => setError('We couldn’t update this service. Please try again.') });
    else create.mutate({ data: values }, { onSuccess: done, onError: () => setError('We couldn’t save this service. Please try again.') });
  };
  const toggleActive = (service: Service) => update.mutate({ serviceId: service.id, data: { active: !service.active } }, { onSuccess: () => void client.invalidateQueries({ queryKey: getListServicesQueryKey() }) });
  const deleteService = (service: Service) => { if (window.confirm(`Remove “${service.name}” from the service menu?`)) remove.mutate({ serviceId: service.id }, { onSuccess: () => void client.invalidateQueries({ queryKey: getListServicesQueryKey() }) }); };
  const pending = create.isPending || update.isPending;
  return <div className="rise-in">
    <section className="border border-[#e3d9ce] bg-[#fcfaf6]">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e7ded5] p-5 md:px-7 md:py-6"><div><p className="eyebrow">A menu that feels like you</p><h2 className="serif mt-1 text-2xl">Services & pricing</h2></div><button className="btn-primary" onClick={() => { setCreating(true); setEditing(null); }} data-testid="button-add-service"><Plus size={15} /> Add a service</button></div>
      {query.isLoading ? <div className="p-5"><LoadingBlock rows={5} /></div> : query.isError ? <div className="p-5"><QueryError retry={() => void query.refetch()} /></div> : services.length ? <div className="divide-y divide-[#eee6de]">{services.map((service) => <div key={service.id} className="flex flex-wrap items-center gap-4 px-5 py-4 md:px-7" data-testid={`row-admin-service-${service.id}`}><div className="flex-1"><p className="serif text-lg text-[#493d36]">{service.name}</p><p className="mt-1 text-[10px] text-[#88796e]">{service.category} · {service.durationMinutes} min · {money(service.price)}</p><p className="mt-1 text-xs text-[#76695e]">{service.description}</p></div><span className={`text-[9px] font-semibold uppercase tracking-[.12em] ${service.active ? 'text-[#55715c]' : 'text-[#9b8c80]'}`}>{service.active ? 'Active' : 'Hidden'}</span><div className="flex gap-2"><button className="btn-outline px-3 py-2 text-[9px]" onClick={() => { setEditing(service); setCreating(false); }} data-testid={`button-edit-service-${service.id}`}><Pencil size={13} /> Edit</button><button className="btn-outline px-3 py-2 text-[9px]" onClick={() => toggleActive(service)} disabled={update.isPending} data-testid={`button-toggle-service-${service.id}`}>{service.active ? 'Hide' : 'Show'}</button><button className="border border-[#e7d4cc] px-3 py-2 text-[#9b5b4e] hover:bg-[#fbf0ec]" onClick={() => deleteService(service)} disabled={remove.isPending} aria-label={`Delete ${service.name}`} data-testid={`button-delete-service-${service.id}`}><Trash2 size={14} /></button></div></div>)}</div> : <div className="px-5 py-14 text-center"><Scissors className="mx-auto text-[#a48a78]" size={24} /><h3 className="serif mt-3 text-xl">A fresh page for your menu.</h3><p className="mt-1 text-xs text-[#8c7d72]">Add the first service to get started.</p></div>}
    </section>
    {(creating || editing) && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#302925]/55 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="service-form-title">
      <form onSubmit={save} className="max-h-[92dvh] w-full max-w-xl overflow-y-auto bg-[#fcfaf6] p-5 md:p-8">
        <div className="flex items-start justify-between"><div><p className="eyebrow">{editing ? 'Refine the menu' : 'Something lovely, added'}</p><h3 id="service-form-title" className="serif mt-1 text-2xl">{editing ? 'Edit service' : 'New service'}</h3></div><button type="button" aria-label="Close" onClick={() => { setEditing(null); setCreating(false); }} data-testid="button-close-service-form"><X size={20} /></button></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="field-label" htmlFor="service-name">Service name</label><input className="field" id="service-name" name="name" required minLength={1} defaultValue={editing?.name ?? emptyService.name} data-testid="input-service-name" /></div>
          <div><label className="field-label" htmlFor="service-category">Category</label><input className="field" id="service-category" name="category" required defaultValue={editing?.category ?? ''} placeholder="Hair, skin, nails…" data-testid="input-service-category" /></div>
          <div><label className="field-label" htmlFor="service-duration">Duration in minutes</label><input className="field" id="service-duration" name="durationMinutes" type="number" min="15" step="15" required defaultValue={editing?.durationMinutes ?? 60} data-testid="input-service-duration" /></div>
          <div><label className="field-label" htmlFor="service-price">Price in dollars</label><input className="field" id="service-price" name="price" type="number" min="0" step="1" required defaultValue={editing?.price ?? ''} data-testid="input-service-price" /></div>
          <div className="sm:col-span-2"><label className="field-label" htmlFor="service-description">Description</label><textarea className="field resize-y" id="service-description" name="description" rows={3} defaultValue={editing?.description ?? ''} data-testid="input-service-description" /></div>
        </div>
        {error && <p className="mt-4 text-sm text-[#994d40]" role="alert">{error}</p>}
        <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-outline" onClick={() => { setEditing(null); setCreating(false); }} data-testid="button-cancel-service">Cancel</button><button className="btn-primary" disabled={pending} data-testid="button-save-service">{pending ? 'Saving…' : 'Save service'}</button></div>
      </form>
    </div>}
  </div>;
}
function CampaignManager() {
  const client = useQueryClient();
  const query = useListCampaigns();
  const create = useCreateCampaign();
  const send = useSendCampaign();
  const clientsQuery = useListClients();
  const [composer, setComposer] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const campaigns = query.data ?? [];
  const saveCampaign = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(''); setNotice('');
    create.mutate({ data: { subject: String(form.get('subject') || ''), body: String(form.get('body') || '') } }, {
      onSuccess: () => { setComposer(false); setNotice('Your campaign draft has been saved.'); void client.invalidateQueries({ queryKey: getListCampaignsQueryKey() }); },
      onError: () => setError('We couldn’t save that draft. Please try again.'),
    });
  };
  const sendCampaign = (id: string) => {
    if (!window.confirm('Send this campaign to clients who opted in to salon updates?')) return;
    setError(''); setNotice('');
    send.mutate({ campaignId: id }, {
      onSuccess: (result) => { setNotice(`Campaign sent to ${result.recipientCount} opted-in clients.`); void client.invalidateQueries({ queryKey: getListCampaignsQueryKey() }); void client.invalidateQueries({ queryKey: getListClientsQueryKey() }); },
      onError: () => setError('We couldn’t send this campaign. Please try again.'),
    });
  };
  return <div className="rise-in space-y-6">
    <section className="flex flex-col justify-between gap-5 bg-[#e8d9ca] p-6 md:flex-row md:items-center md:p-8"><div><p className="eyebrow">Thoughtful notes, never noise</p><h2 className="serif mt-2 text-3xl">Keep in touch, beautifully.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#705f54]">Send salon news and offers to the clients who have chosen to hear from you.</p></div><div className="md:text-right"><p className="serif text-3xl text-[#493a32]">{clientsQuery.data?.filter((item) => item.marketingOptIn).length ?? '—'}</p><p className="text-[9px] uppercase tracking-[.13em] text-[#79695d]">opted-in recipients</p><button className="btn-primary mt-4" onClick={() => { setComposer(true); setError(''); }} data-testid="button-create-campaign"><Plus size={14} /> Write a campaign</button></div></section>
    {notice && <div className="border border-[#cddcc9] bg-[#edf3ea] px-4 py-3 text-sm text-[#4e6b55]" role="status" data-testid="status-campaign-notice">{notice}</div>}
    {error && <div className="border border-[#e6c9c2] bg-[#fbf1ed] px-4 py-3 text-sm text-[#78483d]" role="alert">{error}</div>}
    <section className="border border-[#e3d9ce] bg-[#fcfaf6]">
      <div className="border-b border-[#e7ded5] px-5 py-4 md:px-7"><p className="eyebrow">A little mailbox</p><h2 className="serif mt-1 text-xl">Campaigns</h2></div>
      {query.isLoading ? <div className="p-5"><LoadingBlock rows={4} /></div> : query.isError ? <div className="p-5"><QueryError retry={() => void query.refetch()} /></div> : campaigns.length ? <div className="divide-y divide-[#eee6de]">{campaigns.map((campaign) => <article key={campaign.id} className="flex flex-wrap items-center gap-4 px-5 py-5 md:px-7" data-testid={`row-campaign-${campaign.id}`}><span className={`flex h-10 w-10 items-center justify-center ${campaign.status === 'sent' ? 'bg-[#e7eee4] text-[#55715c]' : 'bg-[#f1e8dc] text-[#987458]'}`}><Mail size={17} /></span><div className="min-w-[170px] flex-1"><p className="font-semibold text-sm text-[#493d36]">{campaign.subject}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-[#82756b]">{campaign.body}</p><p className="mt-1 text-[9px] text-[#a09185]">{campaign.status === 'sent' ? `Sent ${campaign.sentAt ? dateLabel(campaign.sentAt) : ''} · ${campaign.recipientCount} recipients` : `Draft · created ${dateLabel(campaign.createdAt)}`}</p></div><span className={`text-[9px] font-bold uppercase tracking-[.12em] ${campaign.status === 'sent' ? 'text-[#55715c]' : 'text-[#987458]'}`}>{campaign.status}</span>{campaign.status === 'draft' && <button className="btn-outline px-3 py-2 text-[9px]" onClick={() => sendCampaign(campaign.id)} disabled={send.isPending} data-testid={`button-send-campaign-${campaign.id}`}><Send size={13} /> {send.isPending ? 'Sending…' : 'Send'}</button>}</article>)}</div> : <div className="px-5 py-14 text-center"><Mail className="mx-auto text-[#a48a78]" size={24} /><h3 className="serif mt-3 text-xl">A blank page and a good idea.</h3><p className="mt-1 text-xs text-[#8c7d72]">Your saved campaigns will appear here.</p></div>}
    </section>
    {composer && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#302925]/55 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="campaign-title">
      <form onSubmit={saveCampaign} className="max-h-[92dvh] w-full max-w-xl overflow-y-auto bg-[#fcfaf6] p-5 md:p-8">
        <div className="flex items-start justify-between"><div><p className="eyebrow">A note worth opening</p><h3 id="campaign-title" className="serif mt-1 text-2xl">New campaign</h3></div><button type="button" onClick={() => setComposer(false)} aria-label="Close" data-testid="button-close-campaign"><X size={20} /></button></div>
        <p className="mt-4 text-xs leading-5 text-[#817166]">This saves a draft. You can review it before sending to clients who opted in.</p>
        <div className="mt-5"><label className="field-label" htmlFor="campaign-subject">Subject line</label><input id="campaign-subject" name="subject" required minLength={3} className="field" placeholder="A little something for you" data-testid="input-campaign-subject" /></div>
        <div className="mt-4"><label className="field-label" htmlFor="campaign-body">Your note</label><textarea id="campaign-body" name="body" rows={7} required minLength={3} className="field resize-y" placeholder="Write a warm, personal note…" data-testid="input-campaign-body" /></div>
        <div className="mt-6 flex justify-end gap-3"><button type="button" className="btn-outline" onClick={() => setComposer(false)} data-testid="button-cancel-campaign">Cancel</button><button className="btn-primary" disabled={create.isPending} data-testid="button-save-campaign">{create.isPending ? 'Saving…' : 'Save draft'}</button></div>
      </form>
    </div>}
  </div>;
}

function AccountPage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const bookingsQuery = useGetMyBookings({ query: { queryKey: getGetMyBookingsQueryKey() } });
  const bookings = (bookingsQuery.data ?? []).slice().sort((a, b) => a.startAt.localeCompare(b.startAt));
  return <main className="salon-shell min-h-[100dvh]">
    <header className="border-b border-[#e1d6ca] bg-[#f8f4ed] px-5 py-4 md:px-10"><div className="mx-auto flex max-w-6xl items-center justify-between"><Brand /><div className="flex items-center gap-4 text-xs"><Link href="/" className="text-[#77695f] hover:text-[#9d6857]" data-testid="link-account-home">Salon home</Link><button onClick={() => void signOut({ redirectUrl: basePath || '/' })} className="text-[#8c594b]" data-testid="button-account-sign-out">Sign out</button></div></div></header>
    <div className="mx-auto max-w-6xl px-5 py-10 md:px-10 md:py-16">
      <div className="mb-8 border-b border-[#dfd4c8] pb-6"><p className="eyebrow">Your Mallinabella account</p><h1 className="serif mt-2 text-4xl">Welcome{user?.firstName ? `, ${user.firstName}` : ' back'}.</h1><p className="mt-2 text-sm text-[#76695e]">Your appointments, all in one place.</p></div>
      <section className="border border-[#e3d9ce] bg-[#fcfaf6]">
        <div className="border-b border-[#e7ded5] px-5 py-4 md:px-7"><p className="eyebrow">Your visits</p><h2 className="serif mt-1 text-2xl">Appointment history</h2></div>
        {bookingsQuery.isLoading ? <div className="p-5"><LoadingBlock rows={4} /></div> : bookingsQuery.isError ? <div className="p-5"><QueryError retry={() => void bookingsQuery.refetch()} /></div> : bookings.length ? <div className="divide-y divide-[#eee6de]">{bookings.map((booking) => <BookingLine key={booking.id} booking={booking} />)}</div> : <div className="px-5 py-14 text-center"><CalendarDays className="mx-auto text-[#a48a78]" size={25} /><h3 className="serif mt-4 text-xl">Your first visit is waiting.</h3><p className="mt-2 text-xs text-[#8c7d72]">Once you book, your appointments will be gathered here.</p><Link href="/#book" className="btn-primary mt-5" data-testid="link-account-book">Book a visit <ArrowRight size={14} /></Link></div>}
      </section>
      <p className="mt-5 text-[11px] text-[#9a8b80]">Signed in as {user?.primaryEmailAddress?.emailAddress ?? 'your salon account'}</p>
    </div>
  </main>;
}

function ProtectedAdmin() {
  return <><Show when="signed-in"><AdminShell /></Show><Show when="signed-out"><Redirect to="/sign-in" /></Show></>;
}
function ProtectedAccount() {
  return <><Show when="signed-in"><AccountPage /></Show><Show when="signed-out"><Redirect to="/sign-in" /></Show></>;
}
function SignInPage() {
  return <main className="flex min-h-[100dvh] items-center justify-center bg-[#f3eee6] px-4 py-8">
    <div className="grid w-full max-w-5xl overflow-hidden bg-[#fcfaf6] shadow-[0_24px_80px_rgba(68,48,37,.14)] md:grid-cols-[.8fr_1fr]">
      <div className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-[#443731] p-10 text-[#f7eee5] md:flex">
        <div className="absolute inset-0 opacity-70" style={{ background: 'radial-gradient(ellipse at 72% 25%,#a47b68 0,transparent 42%),linear-gradient(145deg,#655045,#342b27)' }} />
        <div className="absolute inset-5 border border-[#f1dfd0]/25" />
        <div className="relative"><Brand light /></div><div className="relative"><p className="eyebrow !text-[#ddb49d]">A little time for you</p><p className="serif mt-3 text-4xl leading-tight">Your beauty ritual, remembered.</p></div>
      </div>
      <div className="flex flex-col items-center justify-center px-5 py-8 md:px-10"><div className="mb-6 md:hidden"><Brand /></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>
    </div>
  </main>;
}
function SignUpPage() {
  return <main className="flex min-h-[100dvh] items-center justify-center bg-[#f3eee6] px-4 py-8">
    <div className="grid w-full max-w-5xl overflow-hidden bg-[#fcfaf6] shadow-[0_24px_80px_rgba(68,48,37,.14)] md:grid-cols-[.8fr_1fr]">
      <div className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-[#443731] p-10 text-[#f7eee5] md:flex">
        <div className="absolute inset-0 opacity-70" style={{ background: 'radial-gradient(ellipse at 72% 25%,#a47b68 0,transparent 42%),linear-gradient(145deg,#655045,#342b27)' }} />
        <div className="absolute inset-5 border border-[#f1dfd0]/25" />
        <div className="relative"><Brand light /></div><div className="relative"><p className="eyebrow !text-[#ddb49d]">A little more you</p><p className="serif mt-3 text-4xl leading-tight">Make every visit feel like yours.</p></div>
      </div>
      <div className="flex flex-col items-center justify-center px-5 py-8 md:px-10"><div className="mb-6 md:hidden"><Brand /></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>
    </div>
  </main>;
}
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClientInstance = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) queryClientInstance.clear();
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClientInstance]);
  return null;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>
    <Switch>
      <Route path="/" component={PublicHome} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/account" component={ProtectedAccount} />
      <Route path="/admin" component={ProtectedAdmin} />
      <Route component={NotFound} />
    </Switch>
  </ErrorBoundary>;
}
function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to return to your salon account' } },
      signUp: { start: { title: 'Make yourself at home', subtitle: 'Create your Mallinabella account' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ClerkQueryClientCacheInvalidator />
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}
export default App;
