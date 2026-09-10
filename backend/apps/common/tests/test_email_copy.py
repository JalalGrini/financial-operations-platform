from django.test import SimpleTestCase

from apps.common.email_copy import reset_body, reset_html, reset_subject


class ResetEmailCopyTests(SimpleTestCase):
    def test_french_default_subject_and_body(self):
        self.assertEqual(reset_subject("fr"), "Votre code 3.R.B Extreme")
        self.assertEqual(reset_subject(None), "Votre code 3.R.B Extreme")
        body = reset_body("123456", "fr")
        self.assertIn("123456", body)
        self.assertIn("15 minutes", body)
        self.assertIn("pas un mot de passe", body)
        self.assertNotIn("http://", body)
        self.assertNotIn("https://", body)

    def test_html_is_simple_and_has_no_links(self):
        html = reset_html("654321", "en")
        self.assertIn("654321", html)
        self.assertIn("<html", html)
        self.assertIn("15 minutes", html)
        self.assertIn("not a password", html)
        self.assertNotIn("http://", html)
        self.assertNotIn("https://", html)
        self.assertNotIn("<img", html.lower())

    def test_arabic_html_is_rtl(self):
        html = reset_html("111222", "ar")
        self.assertIn('dir="rtl"', html)
        self.assertIn("111222", html)
        self.assertEqual(reset_subject("ar"), "رمز 3.R.B Extreme")
        self.assertEqual(reset_subject("en"), "Your 3.R.B Extreme code")
