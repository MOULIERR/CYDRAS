// A menu item that is being moved from the mockup to the real app.
import { useParams, Link } from 'react-router-dom';
import { findNav } from '../nav';

export function Soon() {
  const { key = '' } = useParams();
  const item = findNav(key);
  return (
    <>
      <div className="pageh"><div><p className="eyebrow">Being built</p><h1>{item?.label.replace('⚙ ', '') ?? 'Coming soon'}</h1></div></div>
      <div className="card soon">
        <p style={{ margin: 0 }}>{item?.about}</p>
        <p className="s" style={{ margin: 0 }}>This screen is done in the mockup and is being connected to your real data now. It shows up here as soon as it's ready.</p>
        <div><Link className="btn sm" to="/">Back to Dashboard</Link></div>
      </div>
    </>
  );
}
