const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');

const app = express();

app.use(cors());
app.use(express.json());

let cachedData = {
  sunset: {
    bookings: 0,
    occupancy: 0,
    revenue: 0,
    adSpend: 0,
    roas: 0,
    cpb: 0,
    followers: 0,
    lastUpdated: null
  },
  hps: {
    leads: 0,
    conversion: 0,
    clients: 0,
    revenue: 0,
    cpl: 0,
    followers: 0,
    views: 0,
    email: 0,
    adSpend: 0,
    roas: 0,
    lastUpdated: null
  }
};

async function getStripeData(businessType) {
  try {
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);

    const charges = await stripe.charges.list({
      limit: 100,
      created: { gte: thirtyDaysAgo }
    });

    let totalRevenue = 0;
    let successfulCharges = 0;

    charges.data.forEach(charge => {
      if (charge.status === 'succeeded') {
        totalRevenue += charge.amount / 100;
        successfulCharges += 1;
      }
    });

    return {
      revenue: parseFloat(totalRevenue.toFixed(2)),
      bookings: successfulCharges,
    };
  } catch (error) {
    console.error('Stripe error:', error.message);
    return { revenue: 0, bookings: 0 };
  }
}

async function getInstagramFollowers(businessType) {
  try {
    const igUserId = process.env[`IG_USER_ID_${businessType.toUpperCase()}`];
    const igAccessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

    if (!igUserId || !igAccessToken) {
      console.log('Instagram credentials not configured');
      return 0;
    }

    const response = await axios.get(
      `https://graph.instagram.com/${igUserId}`,
      {
        params: {
          fields: 'followers_count',
          access_token: igAccessToken
        }
      }
    );

    return response.data.followers_count || 0;
  } catch (error) {
    console.error('Instagram error:', error.message);
    return 0;
  }
}

async function getMetaAdsData(accountId) {
  try {
    const accessToken = process.env.META_ADS_ACCESS_TOKEN;

    if (!accessToken || !accountId) {
      console.log('Meta Ads credentials not configured');
      return { spend: 0, impressions: 0, clicks: 0 };
    }

    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${accountId}/insights`,
      {
        params: {
          fields: 'spend,impressions,clicks,actions',
          access_token: accessToken,
          date_preset: 'last_30d'
        }
      }
    );

    if (response.data.data && response.data.data.length > 0) {
      const insight = response.data.data[0];
      return {
        spend: parseFloat(insight.spend || 0),
        impressions: parseInt(insight.impressions || 0),
        clicks: parseInt(insight.clicks || 0)
      };
    }

    return { spend: 0, impressions: 0, clicks: 0 };
  } catch (error) {
    console.error('Meta Ads error:', error.message);
    return { spend: 0, impressions: 0, clicks: 0 };
  }
}

app.get('/api/metrics', async (req, res) => {
  try {
    const stripeData = await getStripeData('sunset');
    const sunsetFollowers = await getInstagramFollowers('sunset');
    const hpsFollowers = await getInstagramFollowers('hps');
    const sunsetAdData = await getMetaAdsData(process.env.SUNSET_ADS_ACCOUNT_ID);
    const hpsAdData = await getMetaAdsData(process.env.HPS_ADS_ACCOUNT_ID);

    cachedData.sunset = {
      bookings: stripeData.bookings,
      occupancy: 0,
      revenue: stripeData.revenue,
      adSpend: sunsetAdData.spend,
      roas: stripeData.revenue > 0 ? ((stripeData.revenue / sunsetAdData.spend) * 100).toFixed(1) : 0,
      cpb: stripeData.bookings > 0 ? (sunsetAdData.spend / stripeData.bookings).toFixed(2) : 0,
      followers: sunsetFollowers,
      lastUpdated: new Date().toISOString()
    };

    cachedData.hps = {
      leads: 0,
      conversion: 0,
      clients: 0,
      revenue: stripeData.revenue,
      cpl: 0,
      followers: hpsFollowers,
      views: 0,
      email: 0,
      adSpend: hpsAdData.spend,
      roas: stripeData.revenue > 0 ? ((stripeData.revenue / hpsAdData.spend) * 100).toFixed(1) : 0,
      lastUpdated: new Date().toISOString()
    };

    res.json({
      success: true,
      data: cachedData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      data: cachedData
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Endpoints:');
  console.log(`  GET /api/metrics - Get all business metrics`);
  console.log(`  GET /health - Health check`);
});
