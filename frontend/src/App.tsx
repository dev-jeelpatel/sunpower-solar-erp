import ErrorBoundary from './components/ErrorBoundary';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import { Loading } from './components/ui';

// Route-level code splitting keeps the first load small
const Login = lazy(() => import('./pages/Login.tsx'));
const Home = lazy(() => import('./pages/Home.tsx'));
const GridGuide = lazy(() => import('./pages/GridGuide.tsx'));
const PublicEnquiry = lazy(() => import('./pages/PublicEnquiry.tsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.tsx'));
const Enquiries = lazy(() => import('./pages/Enquiries.tsx'));
const EnquiryDetail = lazy(() => import('./pages/EnquiryDetail.tsx'));
const Surveys = lazy(() => import('./pages/Surveys.tsx'));
const Quotes = lazy(() => import('./pages/Quotes.tsx'));
const QuoteDetail = lazy(() => import('./pages/QuoteDetail.tsx'));
const Orders = lazy(() => import('./pages/Orders.tsx'));
const OrderDetail = lazy(() => import('./pages/OrderDetail.tsx'));
const Invoices = lazy(() => import('./pages/Invoices.tsx'));
const InvoiceDetail = lazy(() => import('./pages/InvoiceDetail.tsx'));
const Subsidies = lazy(() => import('./pages/Subsidies.tsx'));
const Customers = lazy(() => import('./pages/Customers.tsx'));
const Inventory = lazy(() => import('./pages/Inventory.tsx'));
const Catalog = lazy(() => import('./pages/Catalog.tsx'));
const Dispatch = lazy(() => import('./pages/Dispatch.tsx'));
const DispatchDetail = lazy(() => import('./pages/DispatchDetail.tsx'));
const Jobs = lazy(() => import('./pages/Jobs.tsx'));
const JobDetail = lazy(() => import('./pages/JobDetail.tsx'));
const Tickets = lazy(() => import('./pages/Tickets.tsx'));
const TicketDetail = lazy(() => import('./pages/TicketDetail.tsx'));
const Lookup = lazy(() => import('./pages/Lookup.tsx'));
const Reports = lazy(() => import('./pages/Reports.tsx'));
const Users = lazy(() => import('./pages/Users.tsx'));

function Protected({ children }: { children: JSX.Element }) {
  const { pathname } = useLocation();
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  // Visitors who land on the root see the public website; deep links go to the staff login
  return user ? children : <Navigate to={pathname === '/' ? '/home' : '/login'} replace />;
}

export default function App() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/home" element={<Home />} />
        <Route path="/grid-guide" element={<GridGuide />} />
        <Route path="/enquire" element={<PublicEnquiry />} />
        <Route path="/login" element={<Login />} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route index element={<Dashboard />} />
          <Route path="enquiries" element={<Enquiries />} />
          <Route path="enquiries/:id" element={<EnquiryDetail />} />
          <Route path="surveys" element={<Surveys />} />
          <Route path="quotes" element={<Quotes />} />
          <Route path="quotes/:id" element={<QuoteDetail />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="invoices/:id" element={<InvoiceDetail />} />
          <Route path="subsidies" element={<Subsidies />} />
          <Route path="customers" element={<Customers />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="dispatch" element={<Dispatch />} />
          <Route path="dispatch/:id" element={<DispatchDetail />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="jobs/:id" element={<JobDetail />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="tickets/:id" element={<TicketDetail />} />
          <Route path="lookup" element={<Lookup />} />
          <Route path="reports" element={<Reports />} />
          <Route path="users" element={<Users />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  );
}
