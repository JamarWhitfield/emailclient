from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EmailContent:
    subject: str
    text_body: str
    html_body: str


def build_email_content(first_name: str, property_address: str, property_type: str) -> EmailContent:
    salutation_name = first_name.strip() if first_name.strip() else "there"
    quote_text = quote_phrase(property_type)

    text_body = "\n\n".join(
        [
            f"Hi {salutation_name},",
            "We at Fleur De Lis Law & Title wanted to take a moment to congratulate you as your closing anniversary approaches. It's always exciting to mark this milestone and we hope you had a great experience working with us!",
            "Additionally, we wanted to let you know that Fleur De Lis Law & Title Co has recently partnered with Riverlands Insurance Company to provide better and more affordable insurance cost in this tough insurance environment.",
            f"If you would like to receive {quote_text}, please feel free to reach out to either our founder, Jeff LeSaicherre, or myself, Kellie Bridges. We would be happy to help and hopefully find you better, more affordable coverage.",
            "You can contact us directly at kellie@fdltitle.com or just by replying to this email.",
            "As always, please don't hesitate to call us for any of your future real estate or legal needs. We are here to help with anything you might need and look forward to working with you again.",
            "Again, thank you for allowing us to be part of your journey and we hope you continue to enjoy your home and property.",
            "Wishing you a happy closing anniversary!",
            "Best,\nKellie Bridges",
        ]
    )

    html_body = """<html>
  <body>
    <p>{salutation}</p>
    <p>We at Fleur De Lis Law &amp; Title wanted to take a moment to congratulate you as your closing anniversary approaches. It's always exciting to mark this milestone and we hope you had a great experience working with us!</p>
    <p>Additionally, we wanted to let you know that Fleur De Lis Law &amp; Title Co has recently partnered with Riverlands Insurance Company to provide better and more affordable insurance cost in this tough insurance environment.</p>
    <p>{quote_line}</p>
    <p>You can contact us directly at <a href="mailto:kellie@fdltitle.com">kellie@fdltitle.com</a> or just by replying to this email.</p>
    <p>As always, please don't hesitate to call us for any of your future real estate or legal needs. We are here to help with anything you might need and look forward to working with you again.</p>
    <p>Again, thank you for allowing us to be part of your journey and we hope you continue to enjoy your home and property.</p>
    <p>Wishing you a happy closing anniversary!</p>
    <p>Best,<br />Kellie Bridges</p>
  </body>
</html>
""".format(
        salutation=f"Hi {salutation_name},",
        quote_line=(
            "If you would like to receive "
            f"{quote_text}, please feel free to reach out to either our founder, Jeff LeSaicherre, or myself, Kellie Bridges. "
            "We would be happy to help and hopefully find you better, more affordable coverage."
        ),
    )

    return EmailContent(
        subject=property_address.strip(),
        text_body=text_body,
        html_body=html_body,
    )


def quote_phrase(property_type: str) -> str:
    if property_type in {"commercial", "investment"}:
        return "a FREE commercial insurance quote"
    return "a FREE homeowners insurance quote"