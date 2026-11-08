import { Navigate, Outlet, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { CreatePage } from './pages/CreatePage';
import { CreaturesPage } from './pages/CreaturesPage';
import { HomePage } from './pages/HomePage';
import { JoinPage } from './pages/JoinPage';
import { useI18n } from './i18n';
import { useSession } from './session';

function RequireSession() {
  const { state, refresh } = useSession();
  const { t } = useI18n();
  if (state.status === 'loading') {
    return (
      <p className="status" role="status">
        {t('common.loading')}
      </p>
    );
  }
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
  if (state.status === 'guest') return <Navigate to="/join" replace />;
  return <Outlet />;
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/join" element={<JoinPage />} />
        <Route element={<RequireSession />}>
          <Route index element={<HomePage />} />
          <Route path="/new" element={<CreatePage />} />
          <Route path="/creatures" element={<CreaturesPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
