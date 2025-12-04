import express from "express";
import { createClient } from "contentful";
import dotenv from "dotenv";
import { documentToHtmlString } from "@contentful/rich-text-html-renderer";
import cookieParser from "cookie-parser"; // 


dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Tell Express we’re using EJS templates in the "views" folder
app.set("view engine", "ejs");

app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve your Webflow export (css, js, images, other html) from /public
app.use(express.static("public"));

// ----- Contentful client -----
const client = createClient({
  space: process.env.CONTENTFUL_SPACE_ID,
  accessToken: process.env.CONTENTFUL_CDA_TOKEN,
  environment: process.env.CONTENTFUL_ENVIRONMENT || "master",
});

app.locals.renderRichText = function (doc) {
  if (!doc) return '';
  return documentToHtmlString(doc);
};

// – expose cookieConsent to all views
app.use((req, res, next) => {
  res.locals.cookieConsent = req.cookies.cookieConsent || null;
  next();
});

//– cookie consent routes
app.post("/cookies/accept", (req, res) => {
  res.cookie("cookieConsent", "accepted", {
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    httpOnly: false, // set true if you don't need JS to read it
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.redirect(req.get("referer") || "/");
});

app.post("/cookies/reject", (req, res) => {
  res.cookie("cookieConsent", "rejected", {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.redirect(req.get("referer") || "/");
});

app.get("/", async (req, res) => {
  try {
    const response = await client.getEntries({
      content_type: "seedrockServices",        // your Service content type ID
    });

    const services = response.items.map((item) => {
      const f = item.fields;
        return {
    title: f["serviceName"],
    slug: f.slug,
    subtitle: f["cardSubheading"],
    imageUrl: f["cardImage"]?.fields?.file?.url
      ? "https:" + f["cardImage"].fields.file.url
      : "/images/default.png",
  };
    });

    res.render("index.ejs", { services });
  } catch (err) {
    console.error("Error fetching services:", err);
    res.status(500).send("Error loading page");
  }
});

// Capabilities
app.get("/our-capabilities", async (req, res) => {
   try {
    const response = await client.getEntries({
      content_type: "seedrockServices",        // your Service content type ID
    });

    const services = response.items.map((item) => {
      const f = item.fields;
        return {
    title: f["serviceName"],
    slug: f.slug,
    subtitle: f["cardSubheading"],
    imageUrl: f["cardImage"]?.fields?.file?.url
      ? "https:" + f["cardImage"].fields.file.url
      : "/images/default.png",
  };
    });

    res.render("our-capabilities", { services });
  } catch (err) {
    console.error("Error fetching services:", err);
    res.status(500).send("Error loading page");
  }
});

// About
app.get("/about-us", (req, res) => {
  res.render("about-us", {
    currentPage: "about",
  });
});

// Careers
app.get("/careers", (req, res) => {
  res.render("careers", {
    currentPage: "careers",
  });
});

// Case Studies
app.get("/casestudies", async (req, res) => {
   try {
    const entries = await client.getEntries({
      content_type: 'caseStudy',          // use your actual Contentful ID
      order: '-sys.createdAt',
    });

    res.render('casestudies', {
      caseStudies: entries.items,
    });
  } catch (err) {
    console.error("Error fetching case studies:", err);
    res.status(500).send("Error loading page");
  }
});

// Case Study Item
app.get("/case-studies/:slug", async (req, res) => {
  const { slug } = req.params;

  // small helper for asset URLs
  const getAssetUrl = (asset) =>
    asset?.fields?.file?.url ? "https:" + asset.fields.file.url : null;

  try {
    // 1. Get the main case study by slug
    const csRes = await client.getEntries({
      content_type: "caseStudy",
      "fields.slug": slug,
      limit: 1,
    });

    if (!csRes.items.length) {
      return res.status(404).send("Case study not found");
    }

    const csEntry = csRes.items[0];
    const f = csEntry.fields;

    const caseStudy = {
      companyName: f.nameOfCompany || null,
      title: f.title || null,
      industry: f.industry || null,
      slug: f.slug,
      // rich text blocks
      block1: f.block1 ? documentToHtmlString(f.block1) : null,
      block4: f.block4 ? documentToHtmlString(f.block4) : null,
      block5: f.block5 ? documentToHtmlString(f.block5) : null,
      block8: f.block8 ? documentToHtmlString(f.block8) : null,
      block9: f.block9 ? documentToHtmlString(f.block9) : null,
      // quote blocks
      block6Quote: f.block6quote || null,
      block6Author: f.block6author || null,
      block10Quote: f.block10quote || null,
      block10Author: f.block10author || null,
      // images
      block2ImageUrl: getAssetUrl(f.block2),
      block3ImageUrl: getAssetUrl(f.block3),
      block7ImageUrl: getAssetUrl(f.block7),
      thumbnailImageUrl: getAssetUrl(f.thumbnailImage),
      heroImageUrl: getAssetUrl(f.mainImage),
      // case type
      casetype: f.casetype?.fields?.name || null,
      casetypeId: f.casetype?.sys?.id || null,
    };

   
    // 2. Fetch up to 3 similar case studies (same casetype, different slug)
    let similarCaseStudies = [];

    if (caseStudy.casetypeId) {
      const similarRes = await client.getEntries({
        content_type: "caseStudy",
        "fields.casetype.sys.id": caseStudy.casetypeId,
        "fields.slug[nin]": [slug], // exclude current slug
        limit: 3,
      });

      similarCaseStudies = similarRes.items.map((item) => {
        const sf = item.fields;
        return {
          companyName: sf.nameOfCompany || null,
          title: sf.title || null,
          slug: sf.slug,
          thumbnailImageUrl: getAssetUrl(sf.thumbnailImage),
          casetype: sf.casetype?.fields?.name || null,
        };
      });
    }

    // 3. Render the case study page
    res.render("casestudy-item", {
      caseStudy,
      similarCaseStudies,
    });
  } catch (err) {
    console.error("Error fetching case study:", err);
    res.status(500).send("Error loading case study page");
  }
});

// Contact
app.get("/contact-us", (req, res) => {
  res.render("contact-us", {
    currentPage: "contact",
  });
});


app.get("/services/:slug", async (req, res) => {
  const { slug } = req.params;

  try {
    // 1. Get the main service by slug
    const serviceRes = await client.getEntries({
      content_type: "seedrockServices",          // <<< use your Service content type ID
      "fields.slug": slug,
      limit: 1,
    });

    if (!serviceRes.items.length) {
      return res.status(404).send("Service not found");
    }

    const serviceEntry = serviceRes.items[0];
    const f = serviceEntry.fields;
    const serviceId = serviceEntry.sys.id;

       const service = {
      name: f["serviceName"],
      slug: f.slug,
      cardSubtitle: f["cardSubheading"],        // short intro
      description: f.serviceDescription
    ? documentToHtmlString(f.serviceDescription)
    : null,    // rich text (we'll keep for later)
      ctaHeading: f["ctaHeading"],
      ctaBody: f["ctaBody"],
      cardImageUrl: f["cardImage"]?.fields?.file?.url
        ? "https:" + f["cardImage"].fields.file.url
        : null,
      heroImageUrl: f["heroImage"]?.fields?.file?.url
        ? "https:" + f["heroImage"].fields.file.url
        : null,
      ctaImageUrl: f["ctaImage"]?.fields?.file?.url
        ? "https:" + f["ctaImage"].fields.file.url
        : null,
    };

    // 2. Get all sub-services linked to this service
    const subRes = await client.getEntries({
      content_type: "subServices",      // <<< use your Sub-service content type ID
      "fields.subServiceParent.sys.id": serviceId,
      order: "fields.subServiceName", // optional
    });

    const subservices = subRes.items.map((item) => {
      const sf = item.fields;
      return {
         name: sf.subServiceName,           // field id
    bullets: sf.bulletList || [],   
      };
    });

    // 3. Render the service page
    res.render("service.ejs", { service, subservices });
  } catch (err) {
    console.error("Error fetching service:", err);
    res.status(500).send("Error loading service page");
  }
});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
