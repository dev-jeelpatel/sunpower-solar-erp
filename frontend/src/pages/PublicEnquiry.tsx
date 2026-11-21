import { Link } from 'react-router-dom';
import EnquiryForm from '../components/EnquiryForm';

// Stand-alone enquiry page (linked from the website and shareable on WhatsApp).
export default function PublicEnquiry() {
  return (
    <div>
      <div className="hero">
        <Link to="/home" className="brand" style={{ justifyContent: 'center', textDecoration: 'none' }}>SunPower Solutions</Link>
        <h1>Power your roof. Cut your bill.</h1>
        <p>Tell us what you need. A solar advisor will call you, check your roof and send a clear quote.</p>
      </div>
      <div className="public-wrap">
        <EnquiryForm />
        <div className="small muted" style={{ textAlign: 'center', marginTop: 14 }}>
          <Link to="/home">← Back to website</Link> · Staff? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
