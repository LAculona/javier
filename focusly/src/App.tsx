import { DialogsProvider } from './context/DialogsContext';
import { TasksProvider } from './context/TasksContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { Dashboard } from './components/dashboard/Dashboard';
import { Hero } from './components/hero/Hero';
import { Footer } from './components/layout/Footer';
import { Header } from './components/layout/Header';
import { CtaBanner } from './components/sections/CtaBanner';
import { Faq } from './components/sections/Faq';
import { Features } from './components/sections/Features';
import { Pricing } from './components/sections/Pricing';
import { StatsSection } from './components/sections/StatsSection';
import { Testimonials } from './components/sections/Testimonials';
import { Toaster } from './components/ui/Toaster';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <TasksProvider>
          <DialogsProvider>
            <a
              href="#contenido"
              className="fixed top-3 left-3 z-[70] -translate-y-20 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent shadow-lifted transition-transform focus:translate-y-0"
            >
              Saltar al contenido
            </a>
            <Header />
            <main id="contenido" tabIndex={-1} className="outline-none">
              <Hero />
              <Dashboard />
              <StatsSection />
              <Features />
              <Pricing />
              <Testimonials />
              <Faq />
              <CtaBanner />
            </main>
            <Footer />
            <Toaster />
          </DialogsProvider>
        </TasksProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
