import { Navigate, Outlet, Route, Routes, useSearchParams } from 'react-router';
import { Layout } from './components/Layout';
import { CreatePage } from './pages/CreatePage';
import { CreaturesPage } from './pages/CreaturesPage';
import { HomePage } from './pages/HomePage';
import { JoinPage } from './pages/JoinPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { useI18n } from './i18n';
import { useSession } from './session';

function SessionPending() {
  const { state, refresh } = useSession();
  const { t } = useI18n();
  if (state.status === 'offline') {
    return (
      <div className="panel" role="alert">
        <p>{t('error.network')}</p>
        <button type="button" className="button" onClick={() => void refresh()}>
          {t('common.retry')}
        </button>
      </div>
    );
  }
  return (
    <p className="status" role="status">
      {t('common.loading')}
    </p>
  );
}

function RequireSession() {
  const { state } = useSession();
  if (state.status === 'loading' || state.status === 'offline') return <SessionPending />;
  if (state.status === 'guest') return <Navigate to="/" replace />;
  return <Outlet />;
}

/** The app's own address: the code form for guests and QR links, the home page once joined. */
function Entry() {
  const { state } = useSession();
  const [params] = useSearchParams();
  if (state.status === 'guest' || params.get('code')) return <JoinPage />;
  if (state.status === 'loading' || state.status === 'offline') return <SessionPending />;
  return <HomePage />;
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Entry />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route element={<RequireSession />}>
          <Route path="/new" element={<CreatePage />} />
          <Route path="/creatures" element={<CreaturesPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
