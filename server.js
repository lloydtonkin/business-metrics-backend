const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');

const app = express();

app.use(cors());
app.use(express.json());

let cachedData = {
  sunset: {
    revenue: 0,
    netRevenue: 0,
    refundedAmount: 0,
    bookings: 0,
    transactions: 0,
    failedTransactions: 0,
    refunds: 0,
    avgTransactionValue: 0,
    successRate: 0,
    uniqueCustomers: 0,
    occupancy: 0,
    adSpend: 0,
    roas: 0,
    cpb: 0,
    followers: 0,
    callsBooked: 0,
    completedCalls: 0,
    paymentMethods: {},
    lastUpdated: null
  },
  hps: {
    revenue: 0,
    netRevenue: 0,
    refundedAmount: 0,
    bookings: 0,
    transactions: 0,
    failedTransactions: 0,
    refunds: 0,
    avgTransactionValue: 0,
    successRate: 0,
    uniqueCustomers: 0,
    leads: 0,
    conversion: 0,
    clients: 0,
    cpl: 0,
    followers: 0,
    views: 0,
    email: 0,
    adSpend: 0,
    roas: 0,
    callsBooked: 0,
    completedCalls: 0,
    paymentMethods: {},
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
    let failedCharges = 0;
    let refundedAmount = 0;
    let refundCount = 0;
    let totalChargesRequested = 0;
    let customerSet = new Set();
    let paymentMethods = {};

    charges.data.forEach(charge => {
      totalChargesRequested += 1;

      if (charge.customer) {
        customerSet.add(charge.customer);
      }

      const paymentMethod = charge.payment_method_details?.type || 'unknown';
      paymentMethods[paymentMethod] = (paymentMethods[paymentMethod] || 0) + 1;

      if (charge.status === 'succeeded') {
        totalRevenue += charge.amount / 100;
        successfulCharges += 1;

        if (charge.refunds && charge.refunds.data.length > 0) {
          charge.refunds.data.forEach(refund => {
            if (refund.status === 'succeeded') {
              refundedAmount += refund.amount / 100;
              refundCount += 1;
            }
          });
        }
      } else if (charge.status === 'failed') {
        failedCharges += 1;
      }
    });

    const avgTransactionValue = successfulCharges > 0 ? (totalRevenue / successfulCharges).toFixed(2) : 0;
    const successRate = totalChargesRequested > 0 ? ((successfulCharges / totalChargesRequested) * 100).toFixed(1) : 0;
    const netRevenue = (totalRevenue - refundedAmount).toFixed(2);

    return {
      revenue: parseFloat(totalRevenue.toFixed(2)),
      netRevenue: parseFloat(netRevenue),
      refundedAmount: parseFloat(refundedAmount.toFixed(2)),
      bookings: successfulCharges,
      transactions: totalChargesRequested,
      failedTransactions: failedCharges,
      refunds: refundCount,
      avgTransactionValue: parseFloat(avgTransactionValue),
      successRate: parseFloat(successRate),
      uniqueCustomers: customerSet.size,
      paymentMethods: paymentMethods
    };
  } catch (error) {
    console.error('Stripe error:', error.message);
    return {
      revenue: 0,
      netRevenue: 0,
      refundedAmount: 0,
      bookings: 0,
      transactions: 0,
      failedTransactions: 0,
      refunds: 0,
      avgTransactionValue: 0,
      successRate: 0,
      uniqueCustomers: 0,
      paymentMethods: {}
    };
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

async function getGHLData(locationId) {
  try {
    const apiKey = process.env.GHL_API_KEY;

    if (!apiKey || !locationId) {
      console.log('GHL credentials not configured');
      return { callsBooked: 0, completedCalls: 0 };
    }

    const response = await axios.get(
      `https://rest.gohighlevel.com/v1/contacts/`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Version': '2021-04-15'
        },
        params: {
          locationId: locationId,
          limit: 100
        }
      }
    );

    if (response.data && response.data.contacts) {
      let callsBooked = 0;
      response.data.contacts.forEach(contact => {
        if (contact.appointmentCount) {
          callsBooked += contact.appointmentCount;
        }
      });

      return {
        callsBooked: callsBooked,
        completedCalls: 0
      };
    }

    return { callsBooked: 0, completedCalls: 0 };
  } catch (error) {
    console.error('GHL error:', error.message);
    return { callsBooked: 0, completedCalls: 0 };
  }
}

app.get('/api/metrics', async (req, res) => {
  try {
    const stripeData = await getStripeData('sunset');
    const sunsetFollowers = await getInstagramFollowers('sunset');
    const hpsFollowers = await getInstagramFollowers('hps');
    const sunsetAdData = await getMetaAdsData(process.env.SUNSET_ADS_ACCOUNT_ID);
    const hpsAdData = await getMetaAdsData(process.env.HPS_ADS_ACCOUNT_ID);
    const sunsetGHLData = await getGHLData(process.env.SUNSET_GHL_LOCATION_ID);
    const hpsGHLData = await getGHLData(process.env.HPS_GHL_LOCATION_ID);

    cachedData.sunset = {
      revenue: stripeData.revenue,
      netRevenue: stripeData.netRevenue,
      refundedAmount: stripeData.refundedAmount,
      bookings: stripeData.bookings,
      transactions: stripeData.transactions,
      failedTransactions: stripeData.failedTransactions,
      refunds: stripeData.refunds,
      avgTransactionValue: stripeData.avgTransactionValue,
      successRate: stripeData.successRate,
      uniqueCustomers: stripeData.uniqueCustomers,
      occupancy: 0,
      adSpend: sunsetAdData.spend,
      roas: stripeData.revenue > 0 ? ((stripeData.revenue / sunsetAdData.spend) * 100).toFixed(1) : 0,
      cpb: stripeData.bookings > 0 ? (sunsetAdData.spend / stripeData.bookings).toFixed(2) : 0,
      followers: sunsetFollowers,
      callsBooked: sunsetGHLData.callsBooked,
      completedCalls: sunsetGHLData.completedCalls,
      paymentMethods: stripeData.paymentMethods,
      lastUpdated: new Date().toISOString()
    };

    cachedData.hps = {
      revenue: stripeData.revenue,
      netRevenue: stripeData.netRevenue,
      refundedAmount: stripeData.refundedAmount,
      bookings: stripeData.bookings,
      transactions: stripeData.transactions,
      failedTransactions: stripeData.failedTransactions,
      refunds: stripeData.refunds,
      avgTransactionValue: stripeData.avgTransactionValue,
      successRate: stripeData.successRate,
      uniqueCustomers: stripeData.uniqueCustomers,
      leads: 0,
      conversion: 0,
      clients: 0,
      cpl: 0,
      followers: hpsFollowers,
      views: 0,
      email: 0,
      adSpend: hpsAdData.spend,
      roas: stripeData.revenue > 0 ? ((stripeData.revenue / hpsAdData.spend) * 100).toFixed(1) : 0,
      callsBooked: hpsGHLData.callsBooked,
      completedCalls: hpsGHLData.completedCalls,
      paymentMethods: stripeData.paymentMethods,
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
