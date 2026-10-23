//! Why a connection to a relay failed, in a sentence the panel can act on.
//!
//! The enrollment request and the tunnel both reach the relay through several layers — reqwest or
//! tungstenite, hyper, an `io::Error` — and each wraps the one below. The outermost `Display` is
//! all a plain `format!` shows ("error sending request for url (…)"), which hides the one fact a
//! user can do something about: that the relay's certificate was not the one this device trusts.

use std::error::Error;
use std::io;

use super::endpoint::FINGERPRINT_MISMATCH;

const CONNECT_FAILED_PREFIX: &str = "Could not connect to the relay: ";
const LAYER_SEPARATOR: &str = ": ";

pub(super) const UNTRUSTED_CERTIFICATE: &str = "The relay's HTTPS certificate is not trusted by the system, which is what a self-signed certificate looks like. Enter the SHA-256 certificate fingerprint printed in the relay's startup log into 'Certificate fingerprint' and try again.";
pub(super) const CERTIFICATE_NOT_PINNED: &str = "The certificate the relay presented does not match the certificate fingerprint. Check the fingerprint printed in the relay's startup log; if the relay regenerated its certificate, enroll again. If the fingerprint really has not changed, someone may be intercepting this connection.";
pub(super) const NOT_SPEAKING_TLS: &str =
    "The relay did not answer over HTTPS. If the relay was started with --tls off, change the address to start with http://.";

/// The sentence for a failure to reach the relay at all.
///
/// A TLS refusal gets advice of its own; anything else keeps every layer's wording, so the cause
/// at the bottom of the chain — a refused port, an unknown host — is not lost behind the top one.
pub fn describe(error: &(dyn Error + 'static)) -> String {
    match tls_failure(error) {
        Some(TlsFailure::UntrustedCertificate) => UNTRUSTED_CERTIFICATE.to_string(),
        Some(TlsFailure::CertificateNotPinned) => CERTIFICATE_NOT_PINNED.to_string(),
        Some(TlsFailure::NotSpeakingTls) => NOT_SPEAKING_TLS.to_string(),
        None => format!("{CONNECT_FAILED_PREFIX}{}", error_chain(error)),
    }
}

#[derive(Debug, PartialEq, Eq)]
enum TlsFailure {
    /// No fingerprint was pinned and the platform's roots do not vouch for the certificate.
    UntrustedCertificate,
    /// A fingerprint was pinned and the relay presented a different certificate.
    CertificateNotPinned,
    /// The address says `https`, but what came back was not a TLS record — a plain-HTTP relay.
    NotSpeakingTls,
}

fn tls_failure(error: &(dyn Error + 'static)) -> Option<TlsFailure> {
    let rustls_error = chain(error).find_map(|layer| layer.downcast_ref::<rustls::Error>())?;
    match rustls_error {
        rustls::Error::InvalidCertificate(_) => Some(TlsFailure::UntrustedCertificate),
        rustls::Error::General(message) if message == FINGERPRINT_MISMATCH => {
            Some(TlsFailure::CertificateNotPinned)
        }
        rustls::Error::InvalidMessage(_) => Some(TlsFailure::NotSpeakingTls),
        _ => None,
    }
}

fn chain<'a>(error: &'a (dyn Error + 'static)) -> impl Iterator<Item = &'a (dyn Error + 'static)> {
    std::iter::successors(Some(error), |&current| next_layer(current))
}

/// tokio-rustls hands a handshake failure up inside an `io::Error`, and hyper-rustls wraps that in
/// another one. `io::Error::source` skips past the error it wraps straight to that error's own
/// source, which would jump over the `rustls::Error` entirely, so an `io::Error` is unwrapped here.
fn next_layer<'a>(error: &'a (dyn Error + 'static)) -> Option<&'a (dyn Error + 'static)> {
    match error.downcast_ref::<io::Error>() {
        Some(io_error) => io_error
            .get_ref()
            .map(|wrapped| wrapped as &(dyn Error + 'static)),
        None => error.source(),
    }
}

/// Every layer's wording, outermost first, leaving out a layer that only repeats the one above it.
fn error_chain(error: &(dyn Error + 'static)) -> String {
    let mut layers: Vec<String> = Vec::new();
    for layer in chain(error).map(ToString::to_string) {
        if layers
            .last()
            .is_some_and(|previous| previous.contains(&layer))
        {
            continue;
        }
        layers.push(layer);
    }
    layers.join(LAYER_SEPARATOR)
}

#[cfg(test)]
mod tests {
    use std::fmt;

    use rustls::{CertificateError, InvalidMessage};

    use super::*;

    /// Stands in for reqwest's or hyper's wrapper: a message of its own over the error below.
    #[derive(Debug)]
    struct Layer {
        message: &'static str,
        source: Box<dyn Error + Send + Sync>,
    }

    impl fmt::Display for Layer {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str(self.message)
        }
    }

    impl Error for Layer {
        fn source(&self) -> Option<&(dyn Error + 'static)> {
            Some(self.source.as_ref())
        }
    }

    /// The shape a failed handshake arrives in through reqwest: the request error, hyper's connect
    /// error, then hyper-rustls's `io::Error` around tokio-rustls's `io::Error` around the cause.
    fn wrapped(tls: rustls::Error) -> Layer {
        let handshake = io::Error::new(io::ErrorKind::InvalidData, tls);
        Layer {
            message: "error sending request for url (https://8.141.0.175:8443/api/enroll)",
            source: Box::new(Layer {
                message: "client error (Connect)",
                source: Box::new(io::Error::other(handshake)),
            }),
        }
    }

    #[test]
    fn a_certificate_nobody_vouches_for_asks_for_the_fingerprint() {
        let error = wrapped(rustls::Error::InvalidCertificate(
            CertificateError::UnknownIssuer,
        ));

        assert_eq!(tls_failure(&error), Some(TlsFailure::UntrustedCertificate));
        assert_eq!(describe(&error), UNTRUSTED_CERTIFICATE);
    }

    #[test]
    fn a_certificate_other_than_the_pinned_one_is_named_as_such() {
        let error = wrapped(rustls::Error::General(FINGERPRINT_MISMATCH.into()));

        assert_eq!(tls_failure(&error), Some(TlsFailure::CertificateNotPinned));
    }

    #[test]
    fn an_answer_that_is_not_tls_points_at_the_scheme() {
        let error = wrapped(rustls::Error::InvalidMessage(
            InvalidMessage::InvalidContentType,
        ));

        assert_eq!(tls_failure(&error), Some(TlsFailure::NotSpeakingTls));
    }

    /// Without a TLS cause the sentence still reaches the bottom of the chain, which is where a
    /// refused port or an unknown host is actually described.
    #[test]
    fn any_other_failure_keeps_every_layer() {
        let error = Layer {
            message: "error sending request for url (https://relay.example.com/api/enroll)",
            source: Box::new(io::Error::new(
                io::ErrorKind::ConnectionRefused,
                "connection refused",
            )),
        };

        assert_eq!(
            describe(&error),
            "Could not connect to the relay: error sending request for url (https://relay.example.com/api/enroll): connection refused"
        );
    }

    #[test]
    fn a_layer_that_repeats_the_one_above_is_left_out() {
        let error = Layer {
            message: "IO error: connection refused",
            source: Box::new(io::Error::new(
                io::ErrorKind::ConnectionRefused,
                "connection refused",
            )),
        };

        assert_eq!(
            describe(&error),
            "Could not connect to the relay: IO error: connection refused"
        );
    }
}
